// Endpoint: GET /api/catalogo
//
// Radar: por cada producto de una lista curada, busca en eBay los listados
// REALES con stock y devuelve las "tiendas" (vendedores) ordenadas por mejor
// precio, con enlace directo de compra, disponibilidad y fecha de comprobación.
//
// Principio del proyecto: SOLO datos reales, nada simulado.
//  - Precio actual = listado real más barato (por encima de un suelo anti-ruido).
//  - "Tiendas" = vendedores de eBay (marketplace real con muchos vendedores).
//    Amazon/MediaMarkt/ECI no tienen API gratis y bloquean scraping → no se pueden
//    incluir de forma real y legal.
//  - NO hay estimación de precio futuro: requiere histórico real que aún no
//    tenemos (se conseguiría con un cron de registro diario o con Keepa).
//  - Producto sin listados con stock => no se muestra.

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

// `min` = suelo de precio realista para filtrar accesorios/piezas sueltas.
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

interface Listado {
  tienda: string; // vendedor de eBay
  precio: number;
  moneda: string;
  condicion: string;
  url: string; // enlace directo de compra
  disponible: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function mediana(ordenados: number[]): number {
  const m = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[m] : (ordenados[m - 1] + ordenados[m]) / 2;
}

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

async function listadosDe(q: string, token: string, marketplace: string): Promise<Listado[]> {
  const url =
    `${EBAY_BROWSE_URL}?q=${encodeURIComponent(q)}&limit=100` +
    `&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace },
  });
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data.itemSummaries ?? [])
    .map((it: any): Listado | null => {
      const precio = Number(it?.price?.value);
      const url = it?.itemWebUrl;
      if (!Number.isFinite(precio) || precio <= 0 || !url) return null;
      return {
        tienda: it?.seller?.username || 'Vendedor eBay',
        precio,
        moneda: it?.price?.currency || 'EUR',
        condicion: it?.condition || '—',
        url,
        disponible: true, // listado activo = comprable
      };
    })
    .filter((x: Listado | null): x is Listado => x !== null);
}

export default async function handler(req: any, res: any) {
  const clientId = (process.env.EBAY_CLIENT_ID || '').trim();
  const clientSecret = (process.env.EBAY_CLIENT_SECRET || '').trim();
  const marketplace = process.env.EBAY_MARKETPLACE_ID || 'EBAY_ES';

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'eBay no configurado (faltan EBAY_CLIENT_ID/SECRET).' });
  }

  const comprobado = new Date().toISOString();

  try {
    const token = await getAppToken(clientId, clientSecret);

    const resultados = await Promise.all(
      SEEDS.map(async (seed) => {
        const listados = (await listadosDe(seed.q, token, marketplace))
          .filter((l) => l.precio >= seed.min)
          .sort((a, b) => a.precio - b.precio);

        if (listados.length < 3) return null; // sin datos/stock real suficiente

        const precios = listados.map((l) => l.precio);
        const precioActual = r2(precios[0]); // mejor precio disponible ahora
        const precioTipico = r2(mediana(precios));
        // Descuento REAL de la mejor oferta vs el precio típico de hoy (no es
        // una predicción de futuro; es "está barato ahora mismo").
        const descuento = precioTipico > 0 ? r2(((precioTipico - precioActual) / precioTipico) * 100) : 0;

        return {
          nombre: seed.nombre,
          categoria: seed.categoria,
          precio_actual: precioActual,
          precio_tipico: precioTipico,
          descuento_pct: descuento,
          stock: listados.length,
          comprobado,
          tiendas: listados.slice(0, 6).map((l) => ({
            tienda: l.tienda,
            precio: r2(l.precio),
            moneda: l.moneda,
            condicion: l.condicion,
            disponible: l.disponible,
            url: l.url,
          })),
        };
      })
    );

    const productos = resultados
      .filter((r: any) => r !== null)
      .sort((a: any, b: any) => b.descuento_pct - a.descuento_pct);

    return res.status(200).json({
      generado: comprobado,
      fuente: 'ebay_browse_api',
      nota: 'Tiendas = vendedores de eBay ES con stock (listados activos). Precio actual = mejor oferta real ahora. Sin estimación de precio futuro (requiere histórico real).',
      productos,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
