// Endpoint: GET /api/inversion
//
// Usa el histórico propio (registrado a diario por el cron) para detectar
// productos que estadísticamente están SUBIENDO de precio y valorarlos como
// inversión. Todo con datos reales; si no hay histórico suficiente, lo dice.

// KV inline (Vercel/Upstash REST) para evitar problemas de bundling de imports.
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

interface Historial {
  dias: Record<string, Record<string, { precio_tipico: number; precio_actual: number; stock: number; score: number }>>;
}

export default async function handler(_req: any, res: any) {
  if (!kvDisponible()) {
    return res.status(200).json({
      configurado: false,
      mensaje: 'Falta crear un store KV en Vercel para registrar el histórico diario. Sin él no se puede detectar el alza real.',
      productos: [],
    });
  }

  try {
    const hist = await kvGet<Historial>('flippr:historial');
    const fechas = hist ? Object.keys(hist.dias).sort() : [];
    if (!hist || fechas.length < 2) {
      return res.status(200).json({
        configurado: true,
        dias: fechas.length,
        mensaje: `El histórico se está construyendo (${fechas.length} día/s registrados). En unos días se podrán detectar alzas reales.`,
        productos: [],
      });
    }

    // Serie de precio típico por producto.
    const series: Record<string, { fecha: string; precio: number }[]> = {};
    for (const f of fechas) {
      for (const [nombre, v] of Object.entries(hist.dias[f])) {
        (series[nombre] ||= []).push({ fecha: f, precio: v.precio_tipico });
      }
    }

    const productos = Object.entries(series)
      .map(([nombre, serie]) => {
        if (serie.length < 2) return null;
        const primero = serie[0].precio;
        const ultimo = serie[serie.length - 1].precio;
        const cambio_pct = primero > 0 ? ((ultimo - primero) / primero) * 100 : 0;
        // Consistencia del alza: fracción de pasos que suben.
        let suben = 0;
        for (let i = 1; i < serie.length; i++) if (serie[i].precio >= serie[i - 1].precio) suben++;
        const consistencia = suben / (serie.length - 1);
        // Confianza: más días y más consistencia => más confianza (nunca ~100%).
        const confianza = Math.round(Math.min(90, 35 + serie.length * 7 + consistencia * 20));
        return {
          nombre,
          precio_actual: ultimo,
          precio_inicial: primero,
          cambio_pct: Math.round(cambio_pct * 10) / 10,
          dias: serie.length,
          consistencia_pct: Math.round(consistencia * 100),
          confianza,
          en_alza: cambio_pct > 2, // sube más de un 2% en la ventana
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.en_alza)
      .sort((a, b) => b.cambio_pct - a.cambio_pct);

    return res.status(200).json({
      configurado: true,
      dias: fechas.length,
      desde: fechas[0],
      hasta: fechas[fechas.length - 1],
      aviso: 'Alza detectada sobre el histórico propio real. Es una señal estadística, no una garantía.',
      productos,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error inesperado' });
  }
}
