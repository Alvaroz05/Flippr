// Acceso a almacenamiento clave-valor (Vercel KV / Upstash Redis) vía REST, sin
// dependencias npm. Lee las variables que inyecta Vercel al crear un store KV.
// Si no hay store configurado, kvDisponible() = false y el resto degrada.

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const kvDisponible = (): boolean => !!(URL && TOKEN);

async function cmd(args: string[]): Promise<any> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error de KV');
  return data.result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await cmd(['GET', key]);
  if (r == null) return null;
  try {
    return JSON.parse(r) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await cmd(['SET', key, JSON.stringify(value)]);
}
