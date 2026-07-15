// Cron diario: /api/cron-snapshot
//
// Se ejecuta 1 vez al día (configurado en vercel.json). Consulta el catálogo
// (precios reales de eBay) y guarda una foto del día en KV. Con los días se
// construye un histórico propio real para detectar alzas de mercado.
//
// Requiere un store KV en Vercel. Protegido opcionalmente con CRON_SECRET.

// KV inline (Vercel/Upstash REST) para evitar problemas de bundling de imports.
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

interface Historial {
  dias: Record<string, Record<string, { precio_tipico: number; precio_actual: number; stock: number; score: number }>>;
}

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!kvDisponible()) {
    return res.status(400).json({ error: 'Almacenamiento KV no configurado. Crea un store KV en Vercel (Storage).' });
  }

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const r = await fetch(`${proto}://${host}/api/catalogo`);
    const cat: any = await r.json();
    if (!cat.productos) throw new Error('Catálogo sin productos');

    const fecha = new Date().toISOString().slice(0, 10);
    const hist: Historial = (await kvGet<Historial>('flippr:historial')) || { dias: {} };

    hist.dias[fecha] = {};
    for (const p of cat.productos) {
      hist.dias[fecha][p.nombre] = {
        precio_tipico: p.precio_tipico,
        precio_actual: p.precio_actual,
        stock: p.stock,
        score: p.subscores?.potencial ?? 0,
      };
    }

    // Conservamos como mucho 90 días.
    const fechas = Object.keys(hist.dias).sort();
    while (fechas.length > 90) delete hist.dias[fechas.shift() as string];

    await kvSet('flippr:historial', hist);

    return res.status(200).json({
      ok: true,
      fecha,
      productos_guardados: Object.keys(hist.dias[fecha]).length,
      dias_en_historial: Object.keys(hist.dias).length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
