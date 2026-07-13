import React, { useEffect, useState } from 'react';
import { TrendingUp, Loader2, XCircle, Clock, Info } from 'lucide-react';

interface ProductoInv {
  nombre: string;
  precio_actual: number;
  precio_inicial: number;
  cambio_pct: number;
  dias: number;
  consistencia_pct: number;
  confianza: number;
}
interface Data {
  configurado: boolean;
  dias?: number;
  mensaje?: string;
  aviso?: string;
  desde?: string;
  hasta?: string;
  productos: ProductoInv[];
}

export default function InversionScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/inversion');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al cargar');
        setData(json as Data);
      } catch (err: any) {
        setError(err.message || 'Error inesperado');
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-dark-900 text-white py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-7 h-7 text-primary-500" />
            <h1 className="text-3xl font-bold font-heading">Productos de inversión</h1>
          </div>
          <p className="text-slate-400">
            Artículos que estadísticamente están subiendo de precio, según el histórico propio (registro diario).
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-20">
            <Loader2 className="w-6 h-6 animate-spin" /> Analizando el histórico…
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {data && !loading && (
          <>
            {(data.mensaje || data.productos.length === 0) && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6 text-sm text-amber-800 flex items-start gap-2">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <span>
                  {data.mensaje ||
                    'Aún no se detectan alzas claras. El sistema registra precios cada día; en unos días aparecerán aquí los productos al alza.'}
                </span>
              </div>
            )}

            {data.productos.length > 0 && (
              <>
                <p className="text-xs text-slate-400 mb-4 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Histórico del {data.desde} al {data.hasta} ({data.dias} días). {data.aviso}
                </p>
                <div className="space-y-3">
                  {data.productos.map((p, i) => (
                    <div key={p.nombre} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                      <div className="text-xl font-bold text-slate-300 w-6 text-center shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{p.nombre}</p>
                        <p className="text-xs text-slate-400">
                          {p.precio_inicial} € → {p.precio_actual} € · {p.dias} días · consistencia {p.consistencia_pct}%
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-emerald-600">+{p.cambio_pct}%</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">confianza {p.confianza}%</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-6">
                  Señal estadística sobre datos reales, no una garantía de revalorización futura.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
