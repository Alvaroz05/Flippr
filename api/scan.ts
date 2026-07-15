// Endpoint: GET /api/scan
//
// Escaneo programado: busca en eBay las categorías de interés, detecta los
// ANUNCIOS NUEVOS respecto al escaneo anterior (comparando IDs guardados en KV),
// guarda el estado y registra las novedades (chollos) para poder mostrarlas.
//
// Lo dispara un workflow de GitHub Actions cada 30 min (Vercel Hobby solo
// permite cron diario). Requiere un store KV en Vercel.
//
// Pasos: 1) buscar  2) descargar anuncios nuevos  3) guardar en KV  4) comparar.

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

// KV inline (Vercel/Upstash REST) para evitar problemas de bundling.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const kvDisponible = () => !!(KV_URL && KV_TOKEN);
async function kvCmd(args: string[]): Promise<any> {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error de KV');
  return data.result;
}
async function kvGet<T>(key: string): Promise<T | null> {
  const r = await kvCmd(['GET', key]);
  if (r == null) return null;
  try { return JSON.parse(r) as T; } catch { return null; }
}
async function kvSet(key: string, value: unknown): Promise<void> {
  await kvCmd(['SET', key, JSON.stringify(value)]);
}

// Categorías a escanear. `max` = precio por debajo del cual un anuncio nuevo se
// considera "chollo" digno de avisar.
// `min`-`max` = banda de precio realista. Solo cuentan anuncios dentro de la
// banda (evita accesorios baratos); se avisa de los nuevos por debajo de `max`.
const SCAN: { categoria: string; q: string; min: number; max: number }[] = [
  { categoria: 'LEGO Star Wars UCS 75192', q: 'LEGO 75192 Millennium Falcon UCS', min: 400, max: 750 },
  { categoria: 'LEGO Icons Titanic', q: 'LEGO 10294 Titanic', min: 400, max: 600 },
  { categoria: 'Nike Dunk Low Panda', q: 'Nike Dunk Low Panda', min: 55, max: 90 },
  { categoria: 'Vinilo Pink Floyd DSOTM', q: 'Pink Floyd Dark Side of the Moon vinyl LP', min: 15, max: 30 },
  { categoria: 'Steam Deck OLED', q: 'Steam Deck OLED 512GB', min: 300, max: 430 },
  { categoria: 'AirPods Pro 2', q: 'AirPods Pro 2 USB-C', min: 120, max: 180 },
  { categoria: 'Seiko SKX007', q: 'Seiko SKX007 automatic', min: 150, max: 230 },
];

interface Item { id: string; titulo: string; precio: number; url: string; }
interface Novedad extends Item { categoria: string; visto: string; }

async function getAppToken(clientId: string, clientSecret: string): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token eBay falló');
  return data.access_token;
}

async function buscar(q: string, token: string, marketplace: string): Promise<Item[]> {
  const url = `${EBAY_BROWSE_URL}?q=${encodeURIComponent(q)}&limit=100&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace } });
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data.itemSummaries ?? [])
    .map((it: any): Item | null => {
      const precio = Number(it?.price?.value);
      if (!it?.itemId || !it?.itemWebUrl || !Number.isFinite(precio)) return null;
      return { id: it.itemId, titulo: it.title || '', precio, url: it.itemWebUrl };
    })
    .filter((x: Item | null): x is Item => x !== null);
}

export default async function handler(req: any, res: any) {
  const secret = process.env.SCAN_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const clientId = (process.env.EBAY_CLIENT_ID || '').trim();
  const clientSecret = (process.env.EBAY_CLIENT_SECRET || '').trim();
  const marketplace = process.env.EBAY_MARKETPLACE_ID || 'EBAY_ES';
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'eBay no configurado.' });
  if (!kvDisponible()) {
    return res.status(400).json({ error: 'Falta el store KV en Vercel: sin base de datos no se puede guardar ni comparar escaneos.' });
  }

  const ahora = new Date().toISOString();
  try {
    const token = await getAppToken(clientId, clientSecret);
    let nuevosTotal = 0;
    const porCategoria: Record<string, number> = {};
    const nuevasNovedades: Novedad[] = [];

    // ?reset=1 limpia el estado y las novedades (para empezar de cero limpio).
    if (req.query?.reset) {
      for (const s of SCAN) await kvSet(`flippr:scan:${s.categoria}`, { ids: [] });
      await kvSet('flippr:novedades', []);
    }

    for (const s of SCAN) {
      // Solo anuncios dentro de la banda de precio realista (fuera ruido).
      const items = (await buscar(s.q, token, marketplace)).filter((i) => i.precio >= s.min && i.precio <= s.max);
      const idsActuales = items.map((i) => i.id);
      const prev = (await kvGet<{ ids: string[] }>(`flippr:scan:${s.categoria}`)) || { ids: [] };
      const primeraVez = prev.ids.length === 0;
      const set = new Set(prev.ids);
      // Anuncios NUEVOS = ids que no estaban en el escaneo anterior.
      const nuevos = items.filter((i) => !set.has(i.id));
      porCategoria[s.categoria] = primeraVez ? 0 : nuevos.length;
      if (!primeraVez) nuevosTotal += nuevos.length;

      // La primera vez solo sembramos la base; no inundamos de "novedades".
      if (!primeraVez) {
        for (const n of nuevos) nuevasNovedades.push({ ...n, categoria: s.categoria, visto: ahora });
      }

      // Guardamos el estado actual (cap 300 ids por categoría).
      await kvSet(`flippr:scan:${s.categoria}`, { ids: idsActuales.slice(0, 300), ts: ahora });
    }

    // Añadimos las novedades al registro global (cap 60, más recientes primero).
    if (nuevasNovedades.length > 0) {
      const prevNov = (await kvGet<Novedad[]>('flippr:novedades')) || [];
      const merged = [...nuevasNovedades.sort((a, b) => a.precio - b.precio), ...prevNov].slice(0, 60);
      await kvSet('flippr:novedades', merged);
    }

    return res.status(200).json({
      ok: true,
      ts: ahora,
      nuevos_total: nuevosTotal,
      chollos_nuevos: nuevasNovedades.length,
      por_categoria: porCategoria,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
