// Endpoint: GET /api/catalogo
//
// Radar de oportunidades: lista curada de productos con reventa activa,
// rankeados por margen potencial usando PRECIOS REALES de eBay.
//
// Honestidad (principio del proyecto: solo datos reales, nada simulado):
//  - "comprar" = percentil 25 de los listados reales (un listado barato real).
//  - "vender"  = mediana de los listados reales (valor de mercado ACTUAL, no una
//               predicción de futuro: no tenemos histórico para predecir).
//  - Se aplica un suelo de precio por producto para no contar accesorios/piezas
//    sueltas que ensucian la búsqueda.
//  - "confianza" se calcula de datos reales: nº de muestras + dispersión.

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

// Comisión fija del 15% (petición del usuario).
const COMISION_PCT = 0.15;

// Lista curada. `min` = suelo de precio realista para filtrar ruido (piezas
// sueltas, accesorios, etc.) que aparecen en la búsqueda pero no son el producto.
const SEEDS: { nombre: string; categoria: string; q: string; min: number }[] = [
  { nombre: 'LEGO Star Wars Halcón Milenario UCS 75192', categoria: 'LEGO', q: 'LEGO 75192 Millennium Falcon UCS', min: 400 },
  { nombre: 'LEGO Technic Bugatti Chiron 42083', categoria: 'LEGO', q: 'LEGO 42083 Bugatti Chiron', min: 150 },
  { nombre: 'Nike Dunk Low Panda', categoria: 'Zapatillas', q: 'Nike Dunk Low Panda black white', min: 55 },
  { nombre: 'Air Jordan 1 Retro High OG', categoria: 'Zapatillas', q: 'Air Jordan 1 Retro High OG', min: 90 },
  { nombre: 'AirPods Pro 2 (USB-C)', categoria: 'Electrónica', q: 'AirPods Pro 2 USB-C sellados', min: 120 },
  { nombre: 'Steam Deck OLED 512GB', categoria: 'Consolas', q: 'Steam Deck OLED 512GB', min: 300 },
  { nombre: 'Zelda Tears of the Kingdom Ed. Coleccionista', categoria: 'Videojuegos', q: 'Zelda Tears of the Kingdom Collector Edition', min: 80 },
  { nombre: 'Pokémon caja 36 sobres (booster box)', categoria: 'TCG', q: 'Pokemon booster box 36 sobres sellado', min: 80 },
  { nombre: 'Vinilo Pink Floyd - The Dark Side of the Moon', categoria: 'Vinilos', q: 'Pink Floyd Dark Side of the Moon vinyl LP', min: 15 },
  { nombre: 'Seiko SKX007 (reloj automático)', categoria: 'Relojes', q: 'Seiko SKX007 automatic', min: 150 },
  { nombre: 'GoPro HERO 12 Black', categoria: 'Electrónica', q: 'GoPro HERO 12 Black', min: 180 },
  { nombre: 'Dyson Airwrap Complete', categoria: 'Belleza', q: 'Dyson Airwrap Complete', min: 200 },
];

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 1) return ordenados[0];
  const idx = (ordenados.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return ordenados[lo];
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

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
    `${EBAY_BROWSE_URL}?q=${encodeURIComponent(q)}&limit=100` +
    `&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace },
  });
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data.itemSummaries ?? [])
    .map((it: any) => Number(it?.price?.value))
    .filter((n: number) => Number.isFinite(n) && n > 0);
}

// Nivel de confianza a partir de datos reales: muestras + dispersión (P75/P25).
function confianza(muestras: number, p25: number, p75: number): 'alta' | 'media' | 'baja' {
  const ratio = p25 > 0 ? p75 / p25 : Infinity;
  if (muestras >= 25 && ratio <= 1.7) return 'alta';
  if (muestras >= 12 && ratio <= 2.5) return 'media';
  return 'baja';
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
        const todos = await preciosDe(seed.q, token, marketplace);
        // Filtramos por el suelo realista para quitar ruido.
        const precios = todos.filter((n) => n >= seed.min).sort((a, b) => a - b);
        if (precios.length < 6) {
          return { nombre: seed.nombre, disponible: false };
        }
        const min = r2(precios[0]);
        const p25 = r2(percentil(precios, 0.25));
        const mediana = r2(percentil(precios, 0.5));
        const p75 = r2(percentil(precios, 0.75));
        const max = r2(precios[precios.length - 1]);

        const comprar = p25;
        const vender = mediana;
        const comisiones = r2(vender * COMISION_PCT);
        const beneficio = r2(vender - comprar - comisiones);
        const roi = r2((beneficio / comprar) * 100);

        return {
          nombre: seed.nombre,
          categoria: seed.categoria,
          marketplace: 'eBay',
          query: seed.q,
          disponible: true,
          muestras: precios.length,
          distribucion: { min, p25, mediana, p75, max },
          comprar,
          vender,
          comisiones,
          beneficio,
          roi,
          confianza: confianza(precios.length, p25, p75),
        };
      })
    );

    const productos = resultados
      .filter((r: any) => r.disponible)
      .sort((a: any, b: any) => b.roi - a.roi);
    const sinDatos = resultados.filter((r: any) => !r.disponible).map((r: any) => r.nombre);

    return res.status(200).json({
      generado: new Date().toISOString(),
      fuente: 'ebay_browse_api',
      comision_pct: COMISION_PCT * 100,
      metrica:
        'ROI = (valor de mercado actual − compra P25 − 15% comisión) / compra. ' +
        '"Vender" es el precio típico de HOY, no una predicción de futuro.',
      aviso: 'Datos reales de listados activos en eBay ES. Señal de oportunidad, no garantía.',
      productos,
      sin_datos: sinDatos,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
