// Endpoint: GET /api/novedades
//
// Devuelve las novedades (anuncios nuevos/chollos) detectadas por el escaneo
// programado (/api/scan), leídas del store KV. Degrada si no hay KV.

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const kvDisponible = () => !!(KV_URL && KV_TOKEN);

async function kvGet<T>(key: string): Promise<T | null> {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error de KV');
  if (data.result == null) return null;
  try { return JSON.parse(data.result) as T; } catch { return null; }
}

export default async function handler(_req: any, res: any) {
  if (!kvDisponible()) {
    return res.status(200).json({
      configurado: false,
      mensaje: 'Falta el store KV en Vercel. Sin él, el escaneo programado no puede guardar novedades.',
      novedades: [],
    });
  }
  try {
    const novedades = (await kvGet<any[]>('flippr:novedades')) || [];
    return res.status(200).json({ configurado: true, total: novedades.length, novedades });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
