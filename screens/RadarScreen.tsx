import React, { useEffect, useState } from 'react';
import { Radar, Loader2, XCircle, ArrowRight, RefreshCw, PlusCircle, Check } from 'lucide-react';
import { anadirItem } from '../lib/inventario';

interface Distribucion {
  min: number;
  p25: number;
  mediana: number;
  p75: number;
  max: number;
}
interface Producto {
  nombre: string;
  categoria: string;
  marketplace: string;
  query: string;
  muestras: number;
  distribucion: Distribucion;
  comprar: number;
  vender: number;
  comisiones: number;
  beneficio: number;
  roi: number;
  confianza: 'alta' | 'media' | 'baja';
}
interface CatalogoData {
  generado: string;
  metrica: string;
  aviso: string;
  productos: Producto[];
  sin_datos: string[];
}

const roiColor = (r: number) => (r >= 30 ? 'text-emerald-600' : r >= 10 ? 'text-amber-600' : 'text-slate-500');

const confBadge = (c: Producto['confianza']) => {
  const map = {
    alta: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Confianza alta' },
    media: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Confianza media' },
    baja: { dot: 'bg-slate-400', text: 'text-slate-500', label: 'Confianza baja' },
  } as const;
  return map[c];
};

// Barra de distribución de precios reales (una serie: magnitud + dispersión).
// Verde de marca para los datos; texto en tinta slate.
function BarraDistribucion({ d }: { d: Distribucion }) {
  const rango = Math.max(d.max - d.min, 0.01);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - d.min) / rango) * 100));
  const izq = pct(d.p25);
  const der = pct(d.p75);
  const med = pct(d.mediana);
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-slate-100">
        {/* banda intercuartílica P25–P75 */}
        <div
          className="absolute top-0 h-2.5 rounded-full bg-primary-200"
          style={{ left: `${izq}%`, width: `${Math.max(der - izq, 2)}%` }}
        />
        {/* mediana */}
        <div className="absolute -top-0.5 h-3.5 w-[2px] bg-primary-600 rounded" style={{ left: `${med}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{d.min} €</span>
        <span className="text-primary-700 font-semibold">mediana {d.mediana} €</span>
        <span>{d.max} €</span>
      </div>
    </div>
  );
}

export default function RadarScreen({ onAnalizar }: { onAnalizar: (nombre: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogoData | null>(null);
  const [anadidos, setAnadidos] = useState<Record<string, boolean>>({});

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/catalogo');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar el radar');
      setData(json as CatalogoData);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const anadir = (p: Producto) => {
    const entrada = window.prompt(`¿A cuánto compraste "${p.nombre}"? (€)`, String(p.comprar));
    if (entrada === null) return;
    const precioCompra = Number(entrada.replace(',', '.'));
    if (!Number.isFinite(precioCompra) || precioCompra <= 0) return;
    anadirItem({
      nombre: p.nombre,
      fuente: 'ebay',
      query: p.query,
      precioCompra,
      fecha: new Date().toISOString().slice(0, 10),
    });
    setAnadidos((a) => ({ ...a, [p.nombre]: true }));
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-dark-900 text-white py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <Radar className="w-7 h-7 text-primary-500" />
            <h1 className="text-3xl font-bold font-heading">Radar de oportunidades</h1>
          </div>
          <p className="text-slate-400">
            Zona de compra: productos con reventa activa, rankeados por ROI con precios reales de eBay.
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

            <div className="space-y-4">
              {data.productos.map((p, i) => {
                const cb = confBadge(p.confianza);
                return (
                  <div key={p.nombre} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-start gap-3">
                      <div className="text-xl font-bold text-slate-300 w-6 text-center shrink-0 pt-0.5">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900">{p.nombre}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-0.5">
                          <span>{p.categoria}</span>
                          <span>· {p.marketplace}</span>
                          <span>· {p.muestras} listados</span>
                          <span className={`inline-flex items-center gap-1 ${cb.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cb.dot}`} /> {cb.label}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-2xl font-bold ${roiColor(p.roi)}`}>{p.roi}%</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">ROI</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div>
                        <p className="text-[11px] text-slate-400">Compra ~ (P25)</p>
                        <p className="font-bold text-slate-800">{p.comprar} €</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400">Vende ~ (hoy)</p>
                        <p className="font-bold text-slate-800">{p.vender} €</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400">Beneficio neto</p>
                        <p className={`font-bold ${roiColor(p.roi)}`}>{p.beneficio} €</p>
                      </div>
                    </div>

                    <BarraDistribucion d={p.distribucion} />

                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => onAnalizar(p.query)}
                        className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                      >
                        Analizar <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => anadir(p)}
                        disabled={anadidos[p.nombre]}
                        className="inline-flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                      >
                        {anadidos[p.nombre] ? <><Check className="w-4 h-4 text-emerald-600" /> En inventario</> : <><PlusCircle className="w-4 h-4" /> A inventario</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {data.sin_datos.length > 0 && (
              <p className="text-xs text-slate-400 mt-5">Sin datos suficientes ahora: {data.sin_datos.join(', ')}.</p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-slate-400">Actualizado: {new Date(data.generado).toLocaleString('es-ES')}</p>
              <button onClick={cargar} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">
                <RefreshCw className="w-4 h-4" /> Actualizar precios
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
