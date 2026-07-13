import React, { useEffect, useState } from 'react';
import { TrendingUp, Loader2, XCircle, ArrowRight, RefreshCw } from 'lucide-react';

interface Producto {
  nombre: string;
  categoria: string;
  query: string;
  muestras: number;
  comprar: number;
  vender: number;
  comisiones: number;
  beneficio: number;
  margen_pct: number;
}

interface CatalogoData {
  generado: string;
  metrica: string;
  aviso: string;
  productos: Producto[];
  sin_datos: string[];
}

// Color del margen según lo atractivo que sea.
const margenColor = (m: number) => {
  if (m >= 30) return 'text-emerald-600';
  if (m >= 10) return 'text-amber-600';
  return 'text-slate-500';
};

export default function CatalogoScreen({ onAnalizar }: { onAnalizar: (nombre: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogoData | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/catalogo');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar el catálogo');
      setData(json as CatalogoData);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-dark-900 text-white py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-7 h-7 text-primary-500" />
            <h1 className="text-3xl font-bold font-heading">Catálogo de oportunidades</h1>
          </div>
          <p className="text-slate-400">
            Productos con reventa habitual, rankeados por margen potencial con precios reales de eBay.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-20">
            <Loader2 className="w-6 h-6 animate-spin" /> Consultando precios reales en eBay…
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {data && !loading && (
          <>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-800">
              <strong>Cómo leerlo:</strong> {data.metrica} {data.aviso}
            </div>

            <div className="space-y-3">
              {data.productos.map((p, i) => (
                <div
                  key={p.nombre}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4"
                >
                  <div className="text-2xl font-bold text-slate-300 w-8 text-center shrink-0">{i + 1}</div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{p.nombre}</p>
                    <p className="text-xs text-slate-400">
                      {p.categoria} · {p.muestras} listados
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                      <span className="text-slate-500">Comprar ~<strong className="text-slate-700">{p.comprar} €</strong></span>
                      <span className="text-slate-500">Vender ~<strong className="text-slate-700">{p.vender} €</strong></span>
                      <span className="text-slate-500">Neto <strong className="text-slate-700">{p.beneficio} €</strong></span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`text-2xl font-bold ${margenColor(p.margen_pct)}`}>{p.margen_pct}%</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">margen</p>
                  </div>

                  <button
                    onClick={() => onAnalizar(p.query)}
                    className="shrink-0 inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                  >
                    Analizar <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {data.sin_datos.length > 0 && (
              <p className="text-xs text-slate-400 mt-5">
                Sin datos suficientes ahora mismo: {data.sin_datos.join(', ')}.
              </p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Actualizado: {new Date(data.generado).toLocaleString('es-ES')}
              </p>
              <button
                onClick={cargar}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
              >
                <RefreshCw className="w-4 h-4" /> Actualizar precios
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
