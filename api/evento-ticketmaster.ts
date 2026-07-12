// Endpoint: GET/POST /api/evento-ticketmaster?q=<termino>
//
// Busca un evento REAL en la API oficial de Ticketmaster (Discovery API) y
// devuelve su fecha y estado de venta, para alimentar el timing de eventos.
//
// IMPORTANTE (honestidad sobre los datos):
//  - La Discovery API es oficial y GRATUITA (rate limit ~5 req/s, 5000/día).
//  - No expone un "sold out" booleano puro. El campo real es
//    dates.status.code: "onsale" | "offsale" | "cancelled" | "postponed" |
//    "rescheduled". "offsale" suele significar agotado O que aún no hay venta,
//    así que devolvemos el estado crudo y una estimación de sold_out marcada
//    como tal. Revisa el estado antes de fiarte del flag.
//
// Configuración (Vercel → Settings → Environment Variables):
//   TICKETMASTER_API_KEY = Consumer Key de tu app en developer.ticketmaster.com
//   TICKETMASTER_LOCALE  = (opcional) por defecto "*" (cualquier país/idioma)

const TM_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

export default async function handler(req: any, res: any) {
  const q = (req.query?.q ?? req.body?.q ?? '').toString().trim();
  if (!q) {
    return res.status(400).json({ error: 'Falta el parámetro de búsqueda "q".' });
  }

  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error:
        'Ticketmaster no configurado. Crea una app gratis en ' +
        'developer.ticketmaster.com y añade TICKETMASTER_API_KEY en las ' +
        'variables de entorno de Vercel.',
    });
  }

  const locale = process.env.TICKETMASTER_LOCALE || '*';

  try {
    const url =
      `${TM_URL}?keyword=${encodeURIComponent(q)}` +
      `&size=5&sort=date,asc&locale=${encodeURIComponent(locale)}` +
      `&apikey=${encodeURIComponent(apiKey)}`;

    const r = await fetch(url);
    const data: any = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: data.fault?.faultstring || 'Error en la API de Ticketmaster' });
    }

    const eventos: any[] = data?._embedded?.events ?? [];
    if (eventos.length === 0) {
      return res.status(200).json({
        query: q,
        fuente: 'ticketmaster_discovery_api',
        encontrado: false,
        mensaje: 'Sin eventos para esa búsqueda.',
      });
    }

    // Nos quedamos con el más próximo (ya vienen ordenados por fecha asc).
    const ev = eventos[0];
    const fecha: string | null = ev?.dates?.start?.localDate ?? null;
    const estado: string = ev?.dates?.status?.code ?? 'unknown';
    // Estimación de sold out: "offsale"/"cancelled" son las señales más cercanas.
    const soldOutEstimado = estado === 'offsale' || estado === 'cancelled';

    return res.status(200).json({
      query: q,
      fuente: 'ticketmaster_discovery_api',
      encontrado: true,
      nombre: ev?.name ?? q,
      fecha_evento: fecha,
      estado_venta: estado,
      sold_out_estimado: soldOutEstimado,
      aviso:
        'Datos REALES de Ticketmaster. "sold_out" es una ESTIMACIÓN a partir del ' +
        `estado "${estado}" (offsale puede ser agotado o venta no iniciada): confírmalo.`,
      url: ev?.url ?? null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
