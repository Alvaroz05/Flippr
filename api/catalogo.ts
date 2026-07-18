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
  { nombre: 'LEGO Icons Bonsái 10281', categoria: 'LEGO', q: 'LEGO 10281 Bonsai Tree', min: 30 },
  { nombre: 'LEGO Botánica Orquídea 10311', categoria: 'LEGO', q: 'LEGO 10311 Orchid', min: 25 },
  { nombre: 'LEGO Star Wars AT-AT 75313', categoria: 'LEGO', q: 'LEGO 75313 AT-AT', min: 120 },
  { nombre: 'Vinilo Fleetwood Mac - Rumours', categoria: 'Vinilos', q: 'Fleetwood Mac Rumours vinyl LP', min: 18 },
  { nombre: 'Garmin Forerunner (reloj GPS)', categoria: 'Relojes', q: 'Garmin Forerunner reloj GPS', min: 120 },
  // --- Sneakers de alto potencial de reventa (colaboraciones / hype) ---
  { nombre: 'New Balance 550 Aimé Leon Dore', categoria: 'Zapatillas', q: 'New Balance 550 Aime Leon Dore', min: 130 },
  { nombre: 'New Balance 9060 Joe Freshgoods', categoria: 'Zapatillas', q: 'New Balance 9060 Joe Freshgoods', min: 140 },
  { nombre: 'New Balance 990 Action Bronson', categoria: 'Zapatillas', q: 'New Balance 990 Action Bronson', min: 150 },
  { nombre: 'Asics x JJJJound (Gel-Kayano/Gel-1130)', categoria: 'Zapatillas', q: 'Asics JJJJound', min: 120 },
  { nombre: 'Asics x Kiko Kostadinov', categoria: 'Zapatillas', q: 'Asics Kiko Kostadinov', min: 150 },
  { nombre: 'Salomon XT-6', categoria: 'Zapatillas', q: 'Salomon XT-6', min: 90 },
  { nombre: 'Salomon ACS Pro', categoria: 'Zapatillas', q: 'Salomon ACS Pro', min: 120 },

  // ===== AMPLIACIÓN =====
  // LEGO premium
  { nombre: 'LEGO Icons Coliseo 10276', categoria: 'LEGO', q: 'LEGO 10276 Colosseum', min: 300 },
  { nombre: 'LEGO Star Wars UCS Star Destroyer 75252', categoria: 'LEGO', q: 'LEGO 75252 Imperial Star Destroyer UCS', min: 500 },
  { nombre: 'LEGO Star Wars Death Star 75159', categoria: 'LEGO', q: 'LEGO 75159 Death Star', min: 300 },
  { nombre: 'LEGO Icons McLaren F1 42141', categoria: 'LEGO', q: 'LEGO 42141 McLaren F1', min: 150 },
  { nombre: 'LEGO Icons Concorde 10318', categoria: 'LEGO', q: 'LEGO 10318 Concorde', min: 130 },
  { nombre: 'LEGO Ideas Máquina de Escribir 21327', categoria: 'LEGO', q: 'LEGO 21327 Typewriter', min: 120 },
  { nombre: 'LEGO Icons Optimus Prime 10302', categoria: 'LEGO', q: 'LEGO 10302 Optimus Prime', min: 90 },
  { nombre: 'LEGO Marvel Guantelete Infinito 76191', categoria: 'LEGO', q: 'LEGO 76191 Infinity Gauntlet', min: 60 },
  { nombre: 'LEGO Icons Orquídea 10311', categoria: 'LEGO', q: 'LEGO 10311 Orchid', min: 25 },
  // Sneakers extra
  { nombre: 'Air Jordan 1 High Chicago', categoria: 'Zapatillas', q: 'Air Jordan 1 High Chicago', min: 150 },
  { nombre: 'Nike SB Dunk', categoria: 'Zapatillas', q: 'Nike SB Dunk', min: 100 },
  { nombre: 'New Balance 2002R', categoria: 'Zapatillas', q: 'New Balance 2002R', min: 90 },
  { nombre: 'Adidas Gazelle', categoria: 'Zapatillas', q: 'Adidas Gazelle', min: 55 },
  { nombre: 'Nike Air Max 1', categoria: 'Zapatillas', q: 'Nike Air Max 1', min: 80 },
  { nombre: 'Asics Gel-Kayano 14', categoria: 'Zapatillas', q: 'Asics Gel-Kayano 14', min: 90 },
  { nombre: 'Salomon Speedcross', categoria: 'Zapatillas', q: 'Salomon Speedcross', min: 70 },
  // Electrónica
  { nombre: 'iPhone 15 Pro', categoria: 'Electrónica', q: 'iPhone 15 Pro', min: 600 },
  { nombre: 'iPad Air (M2)', categoria: 'Electrónica', q: 'iPad Air M2', min: 400 },
  { nombre: 'Sony PlayStation VR2', categoria: 'Electrónica', q: 'PlayStation VR2', min: 250 },
  { nombre: 'Bose QuietComfort Ultra', categoria: 'Audio', q: 'Bose QuietComfort Ultra', min: 200 },
  { nombre: 'Ray-Ban Meta (gafas)', categoria: 'Electrónica', q: 'Ray-Ban Meta smart glasses', min: 200 },
  { nombre: 'DJI Mini 4 (dron)', categoria: 'Electrónica', q: 'DJI Mini 4', min: 300 },
  // Consolas retro
  { nombre: 'Game Boy Color', categoria: 'Retro', q: 'Game Boy Color consola', min: 40 },
  { nombre: 'Super Nintendo (SNES)', categoria: 'Retro', q: 'Super Nintendo SNES consola', min: 60 },
  { nombre: 'Nintendo 64', categoria: 'Retro', q: 'Nintendo 64 consola', min: 55 },
  { nombre: 'Sega Mega Drive', categoria: 'Retro', q: 'Sega Mega Drive consola', min: 45 },
  { nombre: 'Analogue Pocket', categoria: 'Retro', q: 'Analogue Pocket', min: 200 },
  // Videojuegos coleccionista
  { nombre: 'Elden Ring Collector Edition', categoria: 'Videojuegos', q: 'Elden Ring Collector Edition', min: 100 },
  { nombre: 'Final Fantasy VII Rebirth Collector', categoria: 'Videojuegos', q: 'Final Fantasy VII Rebirth Collector Edition', min: 150 },
  // Vinilos
  { nombre: 'Vinilo Michael Jackson - Thriller', categoria: 'Vinilos', q: 'Michael Jackson Thriller vinyl LP', min: 18 },
  { nombre: 'Vinilo Nirvana - Nevermind', categoria: 'Vinilos', q: 'Nirvana Nevermind vinyl LP', min: 20 },
  { nombre: 'Vinilo Amy Winehouse - Back to Black', categoria: 'Vinilos', q: 'Amy Winehouse Back to Black vinyl LP', min: 20 },
  { nombre: 'Vinilo Kendrick Lamar - good kid', categoria: 'Vinilos', q: 'Kendrick Lamar good kid maad city vinyl', min: 25 },
  // Relojes
  { nombre: 'Swatch x Omega MoonSwatch', categoria: 'Relojes', q: 'Omega Swatch MoonSwatch', min: 200 },
  { nombre: 'Seiko Presage', categoria: 'Relojes', q: 'Seiko Presage automatic', min: 220 },
  { nombre: 'Citizen Eco-Drive', categoria: 'Relojes', q: 'Citizen Eco-Drive reloj', min: 90 },
  // TCG (no Pokémon)
  { nombre: 'Yu-Gi-Oh! caja de sobres', categoria: 'TCG', q: 'Yu-Gi-Oh booster box sellado', min: 40 },

  // ===== POKÉMON (sección aparte) =====
  { nombre: 'Pokémon caja 36 sobres (booster box)', categoria: 'Pokémon', q: 'Pokemon booster box 36 sobres sellado', min: 80 },
  { nombre: 'Pokémon Elite Trainer Box (ETB)', categoria: 'Pokémon', q: 'Pokemon Elite Trainer Box sellado', min: 30 },
  { nombre: 'Carta Pokémon Charizard (holo)', categoria: 'Pokémon', q: 'Pokemon Charizard carta holo', min: 30 },
  { nombre: 'Pokémon 151 (caja de sobres)', categoria: 'Pokémon', q: 'Pokemon 151 booster box sellado', min: 80 },
  { nombre: 'Pokémon Celebrations', categoria: 'Pokémon', q: 'Pokemon Celebrations sellado', min: 30 },
  { nombre: 'Pokémon Crown Zenith ETB', categoria: 'Pokémon', q: 'Pokemon Crown Zenith Elite Trainer Box', min: 40 },
];

// Fechas de lanzamiento reales (dato público) por producto. Las que no están
// se muestran sin fecha.
const LANZAMIENTOS: Record<string, string> = {
  'LEGO Star Wars Halcón Milenario UCS 75192': '2017-10-01',
  'LEGO Technic Bugatti Chiron 42083': '2018-06-01',
  'LEGO Icons Titanic 10294': '2021-11-08',
  'LEGO Nintendo Entertainment System 71374': '2020-08-01',
  'LEGO Icons Ramo de Flores 10280': '2021-01-01',
  'LEGO Star Wars R2-D2 75308': '2021-05-01',
  'LEGO Star Wars AT-AT 75313': '2021-11-26',
  'LEGO Icons Bonsái 10281': '2021-01-01',
  'LEGO Botánica Orquídea 10311': '2022-05-01',
  'AirPods Pro 2 (USB-C)': '2023-09-22',
  'GoPro HERO 12 Black': '2023-09-13',
  'Dyson Airwrap Complete': '2018-10-01',
  'Apple Watch Ultra 2': '2023-09-22',
  'Sony WH-1000XM5': '2022-05-20',
  'Nintendo Switch OLED (consola)': '2021-10-08',
  'Steam Deck OLED 512GB': '2023-11-16',
  'PlayStation 5 Slim (consola)': '2023-11-10',
  'Zelda Tears of the Kingdom Ed. Coleccionista': '2023-05-12',
  'Meta Quest 3': '2023-10-10',
  'Apple Watch Series 9': '2023-09-22',
  'Kindle Paperwhite': '2021-10-27',
  'Nintendo Switch Lite (consola)': '2019-09-20',
  'Vinilo Pink Floyd - The Dark Side of the Moon': '1973-03-01',
  'Vinilo The Beatles - Abbey Road': '1969-09-26',
  'Vinilo Daft Punk - Random Access Memories': '2013-05-17',
  'Vinilo Fleetwood Mac - Rumours': '1977-02-04',
  'Seiko SKX007 (reloj automático)': '1996-01-01',
};

interface Listado {
  tienda: string;
  precio: number;
  moneda: string;
  condicion: string;
  url: string;
  disponible: boolean;
  feedbackPct: number | null; // valoración del vendedor (eBay), 0-100
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

// Procesa por lotes para no lanzar decenas de peticiones a eBay a la vez.
async function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < arr.length; i += limit) {
    out.push(...(await Promise.all(arr.slice(i, i + limit).map(fn))));
  }
  return out;
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
  const url = `${EBAY_BROWSE_URL}?q=${encodeURIComponent(q)}&limit=100&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace } });
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data.itemSummaries ?? [])
    .map((it: any): Listado | null => {
      const precio = Number(it?.price?.value);
      const url = it?.itemWebUrl;
      if (!Number.isFinite(precio) || precio <= 0 || !url) return null;
      const fb = Number(it?.seller?.feedbackPercentage);
      return {
        tienda: it?.seller?.username || 'Vendedor eBay',
        precio,
        moneda: it?.price?.currency || 'EUR',
        condicion: it?.condition || '—',
        url,
        disponible: true,
        feedbackPct: Number.isFinite(fb) ? fb : null,
      };
    })
    .filter((x: Listado | null): x is Listado => x !== null);
}

// Modelo de 4 factores sobre señales reales. Devuelve las sub-puntuaciones
// (0-100) para que el frontend calcule el score según el MODO elegido
// (rentabilidad / confiabilidad / equilibrado). Todo con datos reales.
function evaluar(listados: Listado[], antiguedadAnios: number | null) {
  const precios = listados.map((l) => l.precio).sort((a, b) => a - b);
  const actual = precios[0];
  const tipico = mediana(precios);
  const p25 = percentil(precios, 0.25);
  const p75 = percentil(precios, 0.75);
  const stock = precios.length;
  const ratio = p25 > 0 ? p75 / p25 : 3;
  const consistencia = clamp01((2.5 - ratio) / (2.5 - 1.3)); // precios tight = fiable

  // Nuevo vs usado (estado real de los anuncios).
  const preciosNuevo = listados.filter((l) => esNuevo(l.condicion)).map((l) => l.precio);
  const preciosUsado = listados.filter((l) => !esNuevo(l.condicion)).map((l) => l.precio);
  const nuevoDisponible = preciosNuevo.length >= 2 && preciosUsado.length >= 2;
  let nuevoVsReventa = 0;
  if (nuevoDisponible) {
    const mn = mediana(preciosNuevo), mu = mediana(preciosUsado);
    nuevoVsReventa = mn > 0 ? clamp01((mn - mu) / mn / 0.6) : 0;
  }
  const fracNuevo = clamp01(preciosNuevo.length / stock);

  // Valoración media real del vendedor (eBay feedbackPercentage).
  const fbs = listados.map((l) => l.feedbackPct).filter((x): x is number => x != null && Number.isFinite(x));
  const fbAvg = fbs.length ? fbs.reduce((s, x) => s + x, 0) / fbs.length : null;
  const feedbackNorm = fbAvg != null ? clamp01((fbAvg - 90) / 9) : 0.6; // 90%→0, 99%+→1

  // ---- SUB-PUNTUACIONES (0..1) ----
  // Descuento vs precio de mercado (mejor oferta frente al típico; máx útil 50%).
  const descuento = clamp01((tipico - actual) / tipico / 0.5);
  // Liquidez: mercado activo (suficientes anuncios para revender).
  const liquidez = clamp01(stock / 30);
  // Fiabilidad de la oportunidad: vendedor + estado + consistencia de precios.
  const fiabilidad = 0.55 * feedbackNorm + 0.25 * fracNuevo + 0.20 * consistencia;
  // Potencial de revalorización: escasez + antigüedad + hueco nuevo/reventa.
  const escasez = clamp01((60 - stock) / 55);
  const antNorm = antiguedadAnios != null ? clamp01(antiguedadAnios / 6) : 0.4;
  const potencial = nuevoDisponible
    ? 0.40 * escasez + 0.35 * antNorm + 0.25 * nuevoVsReventa
    : 0.55 * escasez + 0.45 * antNorm;

  const subscores = {
    potencial: Math.round(potencial * 100),
    fiabilidad: Math.round(fiabilidad * 100),
    descuento: Math.round(descuento * 100),
    liquidez: Math.round(liquidez * 100),
  };

  // Confianza = calidad del dato (independiente del modo). Nunca ~100%.
  let conf = 40 + clamp01(stock / 25) * 25 + consistencia * 15 + (fbAvg != null ? 10 : 0) + (nuevoDisponible ? 5 : 0);
  const confianza = Math.round(Math.min(92, Math.max(40, conf)));

  // Estimación de rango (basada en el potencial de revalorización).
  const exp = potencial * 0.30; // 0..30% de subida según potencial
  const band = 0.08 + (1 - confianza / 100) * 0.14;
  const objetivo = r2(tipico * (1 + exp));
  const est_min = Math.max(0, r2(tipico * (1 + exp - band)));
  const est_max = r2(tipico * (1 + exp + band));

  const escasez_nivel = stock >= 40 ? 'facil' : stock >= 12 ? 'limitado' : 'escaso';

  return {
    precio_actual: r2(actual),
    precio_tipico: r2(tipico),
    descuento_pct: tipico > 0 ? r2(((tipico - actual) / tipico) * 100) : 0,
    stock,
    escasez_nivel,
    feedback_medio: fbAvg != null ? r2(fbAvg) : null,
    subscores,
    confianza,
    estimacion: { objetivo, min: est_min, max: est_max, horizonte: '3-6 meses' },
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
    const resultados = await mapLimit(SEEDS, 30,
      async (seed) => {
        const listados = (await listadosDe(seed.q, token, marketplace))
          .filter((l) => l.precio >= seed.min)
          .sort((a, b) => a.precio - b.precio);
        if (listados.length < 3) return null;
        const lz = LANZAMIENTOS[seed.nombre];
        const antiguedad = lz ? (Date.now() - new Date(lz).getTime()) / (365.25 * 864e5) : null;
        const ev = evaluar(listados, antiguedad);
        return {
          nombre: seed.nombre,
          categoria: seed.categoria,
          lanzamiento: lz ?? null,
          comprobado,
          ...ev,
          tiendas: listados.slice(0, 6).map((l) => ({
            tienda: l.tienda, precio: r2(l.precio), moneda: l.moneda,
            condicion: l.condicion, disponible: l.disponible, url: l.url,
          })),
        };
      }
    );
    // El score final se calcula en el frontend según el modo; ordenamos por
    // potencial como orden por defecto razonable.
    const productos = resultados
      .filter((r: any) => r !== null)
      .sort((a: any, b: any) => b.subscores.potencial - a.subscores.potencial);

    return res.status(200).json({
      generado: comprobado,
      fuente: 'ebay_browse_api',
      modelo: 'Modelo de 4 factores (potencial, fiabilidad, descuento, liquidez) sobre señales reales de eBay. El score final depende del modo de búsqueda. La estimación no es un dato real.',
      productos,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
