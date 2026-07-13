// Endpoint: GET/POST /api/precios-ebay?q=<termino>
//
// Trae PRECIOS REALES desde la API oficial de eBay (Browse API) y devuelve la
// lista de precios + la mediana, para alimentar el analizador de reventa.
//
// IMPORTANTE (honestidad sobre los datos):
//  - La Browse API devuelve LISTADOS ACTIVOS (precios de venta actuales), no
//    ventas ya completadas. Las ventas completadas ("sold") requieren la
//    Marketplace Insights API, que eBay concede solo con acceso restringido.
//    Aun así, los activos son datos REALES de mercado, no inventados.
//  - No hay scraping: se usa la API oficial con OAuth. Sin credenciales, el
//    endpoint responde 400 explicando cómo obtenerlas (son gratuitas).
//
// Configuración (variables de entorno en Vercel → Settings → Environment Variables):
//   EBAY_CLIENT_ID       = App ID (Client ID) de tu app de producción en developer.ebay.com
//   EBAY_CLIENT_SECRET   = Cert ID (Client Secret)
//   EBAY_MARKETPLACE_ID  = (opcional) por defecto "EBAY_ES"

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

// Cache del token de aplicación en memoria (dura ~2h). Evita pedir uno por llamada.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
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
  if (!res.ok) {
    throw new Error(data.error_description || 'No se pudo obtener el token de eBay');
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  return cachedToken.value;
}

function mediana(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

export default async function handler(req: any, res: any) {
  const q = (req.query?.q ?? req.body?.q ?? '').toString().trim();
  const limit = Math.min(Number(req.query?.limit ?? req.body?.limit ?? 50) || 50, 100);

  if (!q) {
    return res.status(400).json({ error: 'Falta el parámetro de búsqueda "q".' });
  }

  const idRaw = process.env.EBAY_CLIENT_ID || '';
  const secretRaw = process.env.EBAY_CLIENT_SECRET || '';
  // Recortamos espacios/saltos de línea por si se colaron al pegar en Vercel.
  const clientId = idRaw.trim();
  const clientSecret = secretRaw.trim();
  const marketplace = process.env.EBAY_MARKETPLACE_ID || 'EBAY_ES';

  // Diagnóstico seguro (?debug=1): no expone el secreto, solo entorno y longitudes.
  if (req.query?.debug) {
    return res.status(200).json({
      id_configurada: !!idRaw,
      secret_configurada: !!secretRaw,
      entorno_id: clientId.includes('-PRD-')
        ? 'PRODUCTION'
        : clientId.includes('-SBX-')
        ? 'SANDBOX'
        : 'desconocido',
      id_prefijo: clientId.slice(0, 14),
      id_longitud_original: idRaw.length,
      id_longitud_sin_espacios: clientId.length,
      secret_longitud_original: secretRaw.length,
      secret_longitud_sin_espacios: clientSecret.length,
      marketplace,
    });
  }

  if (!clientId || !clientSecret) {
    return res.status(400).json({
      error:
        'eBay no configurado. Crea una app gratis en developer.ebay.com y añade ' +
        'EBAY_CLIENT_ID y EBAY_CLIENT_SECRET en las variables de entorno de Vercel.',
    });
  }

  try {
    const token = await getAppToken(clientId, clientSecret);

    const url =
      `${EBAY_BROWSE_URL}?q=${encodeURIComponent(q)}` +
      `&limit=${limit}` +
      `&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplace,
      },
    });
    const data: any = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: data.errors?.[0]?.message || 'Error en la API de eBay' });
    }

    const items: any[] = data.itemSummaries ?? [];
    const precios = items
      .map((it) => Number(it?.price?.value))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (precios.length === 0) {
      return res.status(200).json({
        query: q,
        marketplace,
        fuente: 'ebay_browse_api',
        aviso: 'Datos REALES pero de listados ACTIVOS (no ventas completadas).',
        n: 0,
        precios: [],
        mediana: null,
        mensaje: 'Sin resultados con precio para esa búsqueda.',
      });
    }

    return res.status(200).json({
      query: q,
      marketplace,
      fuente: 'ebay_browse_api',
      aviso: 'Datos REALES pero de listados ACTIVOS (no ventas completadas).',
      n: precios.length,
      precios,
      mediana: mediana(precios),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
