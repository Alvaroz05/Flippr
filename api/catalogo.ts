// Endpoint: GET /api/catalogo
//
// Por cada producto: listados REALES de eBay con stock (tiendas/vendedores con
// enlace directo), un Opportunity Score (0-100) y una estimación PROBABILÍSTICA
// de precio futuro con % de confianza.
//
// Principio: solo datos reales. La estimación NO es un dato real: es un modelo
// transparente donde cada factor es una señal real y siempre se muestra la
// confianza y la etiqueta de "estimación".
//
// Factores del Opportunity Score (pesos del usuario):
//   descuento vs precio habitual .... 30%
//   escasez (pocas unidades) ........ 20%
//   nuevo vs reventa ................ 25%
//   tendencia de búsqueda (Trends) .. 15%  -> NO disponible (Google bloquea
//                                            servidores: 429). Su peso se
//                                            redistribuye entre el resto.
//   liquidez (nº de anuncios) ....... 10%

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

const SEEDS: { nombre: string; categoria: string; q: string; min: number }[] = [
  // LEGO
  { nombre: 'LEGO Star Wars Halcón Milenario UCS 75192', categoria: 'LEGO', q: 'LEGO 75192 Millennium Falcon UCS', min: 400 },
  { nombre: 'LEGO Technic Bugatti Chiron 42083', categoria: 'LEGO', q: 'LEGO 42083 Bugatti Chiron', min: 150 },
  { nombre: 'LEGO Icons Titanic 10294', categoria: 'LEGO', q: 'LEGO 10294 Titanic', min: 400 },
  { nombre: 'LEGO Nintendo Entertainment System 71374', categoria: 'LEGO', q: 'LEGO 71374 Nintendo NES', min: 150 },
  { nombre: 'LEGO Icons Ramo de Flores 10280', categoria: 'LEGO', q: 'LEGO 10280 Flower Bouquet', min: 30 },
  { nombre: 'LEGO Star Wars R2-D2 75308', categoria: 'LEGO', q: 'LEGO 75308 R2-D2', min: 120 },
  // Zapatillas
  { nombre: 'Nike Dunk Low Panda', categoria: 'Zapatillas', q: 'Nike Dunk Low Panda black white', min: 55 },
  { nombre: 'Air Jordan 1 Retro High OG', categoria: 'Zapatillas', q: 'Air Jordan 1 Retro High OG', min: 90 },
  { nombre: 'Adidas Yeezy Boost 350 V2', categoria: 'Zapatillas', q: 'Adidas Yeezy Boost 350 V2', min: 120 },
  { nombre: 'New Balance 550', categoria: 'Zapatillas', q: 'New Balance 550', min: 70 },
  // Electrónica / audio
  { nombre: 'AirPods Pro 2 (USB-C)', categoria: 'Electrónica', q: 'AirPods Pro 2 USB-C sellados', min: 120 },
  { nombre: 'GoPro HERO 12 Black', categoria: 'Electrónica', q: 'GoPro HERO 12 Black', min: 180 },
  { nombre: 'Dyson Airwrap Complete', categoria: 'Belleza', q: 'Dyson Airwrap Complete', min: 200 },
  { nombre: 'Apple Watch Ultra 2', categoria: 'Electrónica', q: 'Apple Watch Ultra 2 49mm', min: 450 },
  { nombre: 'Sony WH-1000XM5', categoria: 'Audio', q: 'Sony WH-1000XM5', min: 180 },
  { nombre: 'Nintendo Switch OLED (consola)', categoria: 'Consolas', q: 'Nintendo Switch OLED consola', min: 180 },
  // Consolas / videojuegos
  { nombre: 'Steam Deck OLED 512GB', categoria: 'Consolas', q: 'Steam Deck OLED 512GB', min: 300 },
  { nombre: 'PlayStation 5 Slim (consola)', categoria: 'Consolas', q: 'PlayStation 5 Slim consola', min: 350 },
  { nombre: 'Zelda Tears of the Kingdom Ed. Coleccionista', categoria: 'Videojuegos', q: 'Zelda Tears of the Kingdom Collector Edition', min: 80 },
  // TCG
  { nombre: 'Pokémon caja 36 sobres (booster box)', categoria: 'TCG', q: 'Pokemon booster box 36 sobres sellado', min: 80 },
  { nombre: 'Carta Pokémon Charizard (holo)', categoria: 'TCG', q: 'Pokemon Charizard carta holo', min: 30 },
  { nombre: 'Magic The Gathering caja de sobres', categoria: 'TCG', q: 'Magic The Gathering booster box', min: 80 },
  // Vinilos
  { nombre: 'Vinilo Pink Floyd - The Dark Side of the Moon', categoria: 'Vinilos', q: 'Pink Floyd Dark Side of the Moon vinyl LP', min: 15 },
  { nombre: 'Vinilo The Beatles - Abbey Road', categoria: 'Vinilos', q: 'The Beatles Abbey Road vinyl LP', min: 18 },
  { nombre: 'Vinilo Daft Punk - Random Access Memories', categoria: 'Vinilos', q: 'Daft Punk Random Access Memories vinyl', min: 25 },
  // Relojes
  { nombre: 'Seiko SKX007 (reloj automático)', categoria: 'Relojes', q: 'Seiko SKX007 automatic', min: 150 },
  { nombre: 'Casio G-Shock', categoria: 'Relojes', q: 'Casio G-Shock reloj', min: 60 },
  // --- Candidatos de alto volumen (más confianza) ---
  { nombre: 'Nike Air Force 1 07', categoria: 'Zapatillas', q: 'Nike Air Force 1 07 white', min: 50 },
  { nombre: 'Air Jordan 4 Retro', categoria: 'Zapatillas', q: 'Air Jordan 4 Retro', min: 120 },
  { nombre: 'Adidas Samba OG', categoria: 'Zapatillas', q: 'Adidas Samba OG', min: 55 },
  { nombre: 'Meta Quest 3', categoria: 'Electrónica', q: 'Meta Quest 3 128GB', min: 250 },
  { nombre: 'Apple Watch Series 9', categoria: 'Electrónica', q: 'Apple Watch Series 9 45mm', min: 250 },
  { nombre: 'Kindle Paperwhite', categoria: 'Electrónica', q: 'Kindle Paperwhite', min: 70 },
  { nombre: 'Nintendo Switch Lite (consola)', categoria: 'Consolas', q: 'Nintendo Switch Lite consola', min: 100 },
  { nombre: 'Pokémon Elite Trainer Box (ETB)', categoria: 'TCG', q: 'Pokemon Elite Trainer Box sellado', min: 30 },
  { nombre: 'LEGO Icons Bonsái 10281', categoria: 'LEGO', q: 'LEGO 10281 Bonsai Tree', min: 30 },
  { nombre: 'LEGO Botánica Orquídea 10311', categoria: 'LEGO', q: 'LEGO 10311 Orchid', min: 25 },
  { nombre: 'LEGO Star Wars AT-AT 75313', categoria: 'LEGO', q: 'LEGO 75313 AT-AT', min: 120 },
  { nombre: 'Vinilo Fleetwood Mac - Rumours', categoria: 'Vinilos', q: 'Fleetwood Mac Rumours vinyl LP', min: 18 },
  { nombre: 'Garmin Forerunner (reloj GPS)', categoria: 'Relojes', q: 'Garmin Forerunner reloj GPS', min: 120 },
];

interface Listado {
  tienda: string;
  precio: number;
  moneda: string;
  condicion: string;
  url: string;
  disponible: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function mediana(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentil(ordenados: number[], p: number): number {
  if (ordenados.length <= 1) return ordenados[0] ?? 0;
  const idx = (ordenados.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo);
}

const esNuevo = (c: string) => /new|nuevo|neu|sealed|precintad|sin abrir|a estrenar/i.test(c || '');

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
  const url = `${EBAY_BROWSE_URL}?q=${encodeURIComponent(q)}&limit=100&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace } });
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
        disponible: true,
      };
    })
    .filter((x: Listado | null): x is Listado => x !== null);
}

// Modelo probabilístico sobre señales reales. Devuelve score 0-100, confianza,
// estimación de rango futuro y el desglose de factores.
function evaluar(listados: Listado[]) {
  const precios = listados.map((l) => l.precio).sort((a, b) => a - b);
  const actual = precios[0];
  const tipico = mediana(precios);
  const p25 = percentil(precios, 0.25);
  const p75 = percentil(precios, 0.75);
  const stock = precios.length;

  // Factor 1: descuento de la mejor oferta vs precio habitual (máx útil 50%).
  const descuento = clamp01((tipico - actual) / tipico / 0.5);

  // Factor 2: escasez (pocas unidades disponibles = más potencial).
  const escasez = clamp01((60 - stock) / 55);

  // Factor 3: nuevo vs reventa (hay margen si el usado está bastante bajo el nuevo).
  const preciosNuevo = listados.filter((l) => esNuevo(l.condicion)).map((l) => l.precio);
  const preciosUsado = listados.filter((l) => !esNuevo(l.condicion)).map((l) => l.precio);
  let nuevoVsReventa = 0;
  const nuevoDisponible = preciosNuevo.length >= 2 && preciosUsado.length >= 2;
  if (nuevoDisponible) {
    const mn = mediana(preciosNuevo), mu = mediana(preciosUsado);
    nuevoVsReventa = mn > 0 ? clamp01((mn - mu) / mn / 0.6) : 0;
  }

  // Factor 4: tendencia (Google Trends) — NO disponible desde servidor.
  const tendenciaDisponible = false;

  // Factor 5: liquidez (mercado activo: suficientes anuncios para vender).
  const liquidez = clamp01(stock / 30);

  // Pesos del usuario; los no disponibles redistribuyen su peso.
  const factores = [
    { clave: 'descuento', nombre: 'Descuento vs habitual', peso: 30, valor: descuento, disponible: true },
    { clave: 'escasez', nombre: 'Escasez (unidades)', peso: 20, valor: escasez, disponible: true },
    { clave: 'nuevo_vs_reventa', nombre: 'Nuevo vs reventa', peso: 25, valor: nuevoVsReventa, disponible: nuevoDisponible },
    { clave: 'tendencia', nombre: 'Tendencia de búsqueda', peso: 15, valor: 0, disponible: tendenciaDisponible },
    { clave: 'liquidez', nombre: 'Liquidez (anuncios)', peso: 10, valor: liquidez, disponible: true },
  ];
  const pesoDisponible = factores.filter((f) => f.disponible).reduce((s, f) => s + f.peso, 0) || 1;
  const score = Math.round(
    factores.filter((f) => f.disponible).reduce((s, f) => s + (f.peso / pesoDisponible) * f.valor, 0) * 100
  );

  const recomendacion = score >= 70 ? 'Comprar' : score >= 45 ? 'Vigilar' : 'Ignorar';

  // Confianza: nº de muestras + dispersión + factores disponibles. Nunca ~100%.
  const ratio = p25 > 0 ? p75 / p25 : 3;
  let conf = 45;
  conf += clamp01(stock / 25) * 25;
  conf += clamp01((2.5 - ratio) / (2.5 - 1.3)) * 15;
  conf += nuevoDisponible ? 8 : 0;
  const confianza = Math.round(Math.min(92, Math.max(40, conf)));

  // Estimación de rango a 3-6 meses (probabilística, NO un dato real).
  const exp = ((score - 50) / 50) * 0.25; // ±25% según score
  const band = 0.08 + (1 - confianza / 100) * 0.14; // banda más ancha si baja confianza
  const est_min = Math.max(0, r2(tipico * (1 + exp - band)));
  const est_max = r2(tipico * (1 + exp + band));

  return {
    precio_actual: r2(actual),
    precio_tipico: r2(tipico),
    descuento_pct: tipico > 0 ? r2(((tipico - actual) / tipico) * 100) : 0,
    stock,
    opportunity_score: score,
    recomendacion,
    confianza,
    estimacion: { min: est_min, max: est_max, horizonte: '3-6 meses' },
    factores: factores.map((f) => ({ nombre: f.nombre, peso: f.peso, valor: Math.round(f.valor * 100), disponible: f.disponible })),
  };
}

export default async function handler(req: any, res: any) {
  const clientId = (process.env.EBAY_CLIENT_ID || '').trim();
  const clientSecret = (process.env.EBAY_CLIENT_SECRET || '').trim();
  const marketplace = process.env.EBAY_MARKETPLACE_ID || 'EBAY_ES';
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'eBay no configurado.' });

  const comprobado = new Date().toISOString();
  try {
    const token = await getAppToken(clientId, clientSecret);
    const resultados = await Promise.all(
      SEEDS.map(async (seed) => {
        const listados = (await listadosDe(seed.q, token, marketplace))
          .filter((l) => l.precio >= seed.min)
          .sort((a, b) => a.precio - b.precio);
        if (listados.length < 3) return null;
        const ev = evaluar(listados);
        return {
          nombre: seed.nombre,
          categoria: seed.categoria,
          comprobado,
          ...ev,
          tiendas: listados.slice(0, 6).map((l) => ({
            tienda: l.tienda, precio: r2(l.precio), moneda: l.moneda,
            condicion: l.condicion, disponible: l.disponible, url: l.url,
          })),
        };
      })
    );
    const productos = resultados
      .filter((r: any) => r !== null)
      .sort((a: any, b: any) => b.opportunity_score - a.opportunity_score);

    return res.status(200).json({
      generado: comprobado,
      fuente: 'ebay_browse_api',
      modelo: 'Opportunity Score probabilístico sobre señales reales. La estimación de precio futuro NO es un dato real; se muestra siempre con % de confianza.',
      trends_disponible: false,
      productos,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
