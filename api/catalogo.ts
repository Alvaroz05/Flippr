// Endpoint: GET /api/catalogo
//
// Devuelve un catálogo de productos con buena reventa, rankeados por un
// "índice de oportunidad" calculado con PRECIOS REALES de eBay.
//
// Idea (honesta): no podemos saber a cuánto compras tú. Lo que medimos es el
// hueco entre el listado barato (percentil 25) y el precio típico (mediana) en
// eBay. Un hueco grande = margen potencial si consigues comprar por lo bajo.
// Es una señal real de oportunidad, NO una garantía de beneficio.
//
// Reutiliza las credenciales de eBay ya configuradas (EBAY_CLIENT_ID/SECRET).

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

// Lista curada de productos con reventa habitual. Consultas específicas para
// que la distribución de precios sea limpia (evita accesorios/piezas sueltas).
const SEEDS: { nombre: string; categoria: string; q: string }[] = [
  { nombre: 'LEGO Star Wars Halcón Milenario UCS 75192', categoria: 'LEGO', q: 'LEGO 75192 Millennium Falcon UCS' },
  { nombre: 'LEGO Icons Ramo de Flores 10280', categoria: 'LEGO', q: 'LEGO 10280 Flower Bouquet' },
  { nombre: 'Nintendo Switch OLED (consola)', categoria: 'Consolas', q: 'Nintendo Switch OLED consola blanca' },
  { nombre: 'AirPods Pro 2ª generación', categoria: 'Audio', q: 'AirPods Pro 2 generacion USB-C sellados' },
  { nombre: 'Dyson Airwrap Complete', categoria: 'Belleza', q: 'Dyson Airwrap Complete' },
  { nombre: 'Nike Dunk Low Panda', categoria: 'Zapatillas', q: 'Nike Dunk Low Panda black white' },
  { nombre: 'GoPro HERO 12 Black', categoria: 'Electrónica', q: 'GoPro HERO 12 Black' },
  { nombre: 'Pokémon caja 36 sobres (booster box)', categoria: 'Coleccionables', q: 'Pokemon booster box 36 sobres español sellado' },
  { nombre: 'Steam Deck OLED 512GB', categoria: 'Consolas', q: 'Steam Deck OLED 512GB' },
  { nombre: 'LEGO Technic Bugatti 42083', categoria: 'LEGO', q: 'LEGO 42083 Bugatti Chiron' },
];

// Comisión orientativa de eBay ES (véndelo tú): ~11,5% + 0,35€.
const EBAY_FEE_PCT = 0.115;
const EBAY_FEE_FIXED = 0.35;

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 1) return ordenados[0];
  const idx = (ordenados.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return ordenados[lo];
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo);
}

async function getAppToken(clientId: string, clientSecret: string): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token eBay falló');
  return data.access_token;
}

async function preciosDe(q: string, token: string, marketplace: string): Promise<number[]> {
  const url =
    `${EBAY_BROWSE_URL}?q=${encodeURIComponent(q)}&limit=50` +
    `&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace },
  });
  if (!r.ok) return [];
  const data: any = await r.json();
  return (data.itemSummaries ?? [])
    .map((it: any) => Number(it?.price?.value))
    .filter((n: number) => Number.isFinite(n) && n > 0);
}

export default async function handler(req: any, res: any) {
  const clientId = (process.env.EBAY_CLIENT_ID || '').trim();
  const clientSecret = (process.env.EBAY_CLIENT_SECRET || '').trim();
  const marketplace = process.env.EBAY_MARKETPLACE_ID || 'EBAY_ES';

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'eBay no configurado (faltan EBAY_CLIENT_ID/SECRET).' });
  }

  try {
    const token = await getAppToken(clientId, clientSecret);

    const resultados = await Promise.all(
      SEEDS.map(async (seed) => {
        const precios = (await preciosDe(seed.q, token, marketplace)).sort((a, b) => a - b);
        if (precios.length < 8) {
          return { ...seed, muestras: precios.length, disponible: false };
        }
        const comprar = Math.round(percentil(precios, 0.25) * 100) / 100; // listado barato
        const vender = Math.round(percentil(precios, 0.5) * 100) / 100; // precio típico
        const comisiones = Math.round((vender * EBAY_FEE_PCT + EBAY_FEE_FIXED) * 100) / 100;
        const beneficio = Math.round((vender - comprar - comisiones) * 100) / 100;
        const margen_pct = Math.round((beneficio / comprar) * 1000) / 10;
        return {
          nombre: seed.nombre,
          categoria: seed.categoria,
          query: seed.q,
          disponible: true,
          muestras: precios.length,
          comprar,
          vender,
          comisiones,
          beneficio,
          margen_pct,
        };
      })
    );

    const disponibles = resultados
      .filter((r: any) => r.disponible)
      .sort((a: any, b: any) => b.margen_pct - a.margen_pct);
    const sinDatos = resultados.filter((r: any) => !r.disponible);

    return res.status(200).json({
      generado: new Date().toISOString(),
      fuente: 'ebay_browse_api',
      metrica: 'Índice de oportunidad = margen entre el listado barato (P25) y el precio típico (mediana), menos comisiones eBay.',
      aviso: 'Datos REALES de listados activos en eBay ES. Señal de oportunidad, no garantía: asume que consigues comprar por lo bajo.',
      productos: disponibles,
      sin_datos: sinDatos.map((r: any) => r.nombre),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
