import React, { useEffect, useState } from 'react';
import { Zap, Loader2, XCircle, ExternalLink, Info, Clock, RefreshCw } from 'lucide-react';

interface Novedad { categoria: string; titulo: string; precio: number; url: string; visto: string; }
interface Data { configurado: boolean; mensaje?: string; total?: number; novedades: Novedad[]; }

export default function NovedadesScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/novedades');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar');
      setData(json as Data);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-dark-900 text-white py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-7 h-7 text-primary-500" />
            <h1 className="text-3xl font-bold font-heading">Novedades y chollos</h1>
          </div>
          <p className="text-slate-400">Anuncios nuevos detectados por el escaneo automático (cada 30 min) respecto al escaneo anterior.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-20">
            <Loader2 className="w-6 h-6 animate-spin" /> Cargando novedades…
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {data && !loading && (
          <>
            {(data.mensaje || data.novedades.length === 0) && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6 text-sm text-amber-800 flex items-start gap-2">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{data.mensaje || 'Aún no hay novedades. El escaneo corre cada 30 min y aquí irán apareciendo los anuncios nuevos por debajo del precio de interés.'}</span>
              </div>
            )}

            {data.novedades.length > 0 && (
              <div className="space-y-2">
                {data.novedades.map((n, i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{n.titulo}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-2">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-full">{n.categoria}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(n.visto).toLocaleString('es-ES')}</span>
                      </p>
                    </div>
                    <span className="font-bold text-slate-800 shrink-0">{n.precio} €</span>
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0">
                      Ver <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={cargar} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">
                <RefreshCw className="w-4 h-4" /> Actualizar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
