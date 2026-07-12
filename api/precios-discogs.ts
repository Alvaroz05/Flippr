// Endpoint: GET/POST /api/precios-discogs?q=<termino>
//
// Trae PRECIOS REALES de música/coleccionables desde la API oficial de Discogs.
// Busca releases que coincidan con el término y, para los primeros, consulta
// las estadísticas de mercado (precio más bajo a la venta ahora). Devuelve la
// lista de esos precios + la mediana, para alimentar el analizador.
//
// IMPORTANTE (honestidad sobre los datos):
//  - Son datos REALES de la API oficial (sin scraping), pero reflejan el
//    "precio más bajo A LA VENTA ahora" de cada edición, no ventas completadas.
//  - Discogs exige una cabecera User-Agent propia y un token personal.
//
// Configuración (Vercel → Settings → Environment Variables):
//   DISCOGS_TOKEN = Personal Access Token (Settings → Developers → Generar token)

const DISCOGS_SEARCH = 'https://api.discogs.com/database/search';
const DISCOGS_STATS = 'https://api.discogs.com/marketplace/stats';
const USER_AGENT = 'FlipprRelevoPyme/1.0 +https://relevopymes.vercel.app';

function mediana(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

export default async function handler(req: any, res: any) {
  const q = (req.query?.q ?? req.body?.q ?? '').toString().trim();
  if (!q) {
    return res.status(400).json({ error: 'Falta el parámetro de búsqueda "q".' });
  }

  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    return res.status(400).json({
      error:
        'Discogs no configurado. Genera un token gratis en ' +
        'discogs.com/settings/developers y añade DISCOGS_TOKEN en las ' +
        'variables de entorno de Vercel.',
    });
  }

  const headers = {
    'User-Agent': USER_AGENT,
    Authorization: `Discogs token=${token}`,
  };

  try {
    // 1) Buscar releases que coincidan con el término.
    const searchUrl = `${DISCOGS_SEARCH}?q=${encodeURIComponent(q)}&type=release&per_page=10`;
    const r = await fetch(searchUrl, { headers });
    const data: any = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: data.message || 'Error en la API de Discogs' });
    }

    const releases: any[] = (data.results ?? []).filter((x: any) => x.id);
    if (releases.length === 0) {
      return res.status(200).json({
        query: q,
        fuente: 'discogs_api',
        n: 0,
        precios: [],
        mediana: null,
        mensaje: 'Sin resultados en Discogs para esa búsqueda.',
      });
    }

    // 2) Para las primeras ediciones, pedir el precio más bajo a la venta.
    const ids = releases.slice(0, 6).map((x) => x.id);
    const stats = await Promise.all(
      ids.map(async (id) => {
        try {
          const sr = await fetch(`${DISCOGS_STATS}/${id}`, { headers });
          if (!sr.ok) return null;
          const sd: any = await sr.json();
          const value = Number(sd?.lowest_price?.value);
          const currency = sd?.lowest_price?.currency ?? null;
          return Number.isFinite(value) && value > 0 ? { value, currency } : null;
        } catch {
          return null;
        }
      })
    );

    const validos = stats.filter((s): s is { value: number; currency: string } => s !== null);
    const precios = validos.map((s) => s.value);
    const currency = validos[0]?.currency ?? null;

    if (precios.length === 0) {
      return res.status(200).json({
        query: q,
        fuente: 'discogs_api',
        n: 0,
        precios: [],
        mediana: null,
        mensaje: 'Encontradas ediciones pero ninguna a la venta con precio ahora mismo.',
      });
    }

    return res.status(200).json({
      query: q,
      fuente: 'discogs_api',
      moneda: currency,
      aviso: 'Datos REALES de Discogs: precio más bajo A LA VENTA por edición (no ventas completadas).',
      n: precios.length,
      precios,
      mediana: mediana(precios),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
