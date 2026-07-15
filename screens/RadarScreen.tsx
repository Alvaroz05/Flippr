import React, { useEffect, useState } from 'react';
import { Radar, Loader2, XCircle, RefreshCw, PlusCircle, Check, ExternalLink, Clock, Target, Filter, Star } from 'lucide-react';
import { anadirItem } from '../lib/inventario';

interface Tienda { tienda: string; precio: number; moneda: string; condicion: string; disponible: boolean; url: string; }
interface Subscores { potencial: number; fiabilidad: number; descuento: number; liquidez: number; }
interface Producto {
  nombre: string;
  categoria: string;
  lanzamiento: string | null;
  comprobado: string;
  precio_actual: number;
  precio_tipico: number;
  descuento_pct: number;
  stock: number;
  escasez_nivel: 'facil' | 'limitado' | 'escaso';
  feedback_medio: number | null;
  subscores: Subscores;
  confianza: number;
  estimacion: { objetivo: number; min: number; max: number; horizonte: string };
  tiendas: Tienda[];
}
interface Data { generado: string; modelo: string; productos: Producto[]; }

type Modo = 'equilibradas' | 'rentabilidad' | 'confiables';
const MODOS: Record<Modo, { emoji: string; label: string; w: Subscores }> = {
  equilibradas: { emoji: '⭐', label: 'Equilibradas', w: { potencial: 0.40, fiabilidad: 0.30, descuento: 0.20, liquidez: 0.10 } },
  rentabilidad: { emoji: '💰', label: 'Máxima rentabilidad', w: { potencial: 0.55, fiabilidad: 0.10, descuento: 0.30, liquidez: 0.05 } },
  confiables: { emoji: '🛡️', label: 'Más confiables', w: { potencial: 0.20, fiabilidad: 0.50, descuento: 0.15, liquidez: 0.15 } },
};
const score = (p: Producto, w: Subscores) =>
  Math.round(w.potencial * p.subscores.potencial + w.fiabilidad * p.subscores.fiabilidad + w.descuento * p.subscores.descuento + w.liquidez * p.subscores.liquidez);

const scoreColor = (s: number) => (s >= 70 ? 'text-emerald-600' : s >= 45 ? 'text-amber-600' : 'text-slate-400');
const reco = (s: number) => (s >= 70 ? 'Comprar' : s >= 45 ? 'Vigilar' : 'Ignorar');
const recoBadge = (s: number) => (s >= 70 ? 'bg-emerald-50 text-emerald-700' : s >= 45 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500');
const escasez = (n: Producto['escasez_nivel']) => ({
  facil: { dot: '🟢', label: 'Fácil de conseguir', text: 'text-emerald-700' },
  limitado: { dot: '🟡', label: 'Stock limitado', text: 'text-amber-700' },
  escaso: { dot: '🔴', label: 'Muy escaso', text: 'text-red-700' },
}[n]);
const confColor = (c: number) => (c >= 75 ? 'bg-emerald-500' : c >= 55 ? 'bg-amber-500' : 'bg-slate-400');

function antiguedad(iso: string): string {
  const d = new Date(iso), now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (m < 0) m = 0;
  const y = Math.floor(m / 12), mm = m % 12;
  return y >= 1 ? `hace ${y} año${y > 1 ? 's' : ''}` : `hace ${mm} mes${mm !== 1 ? 'es' : ''}`;
}

const FACTORES: { clave: keyof Subscores; nombre: string }[] = [
  { clave: 'potencial', nombre: 'Potencial de revalorización' },
  { clave: 'fiabilidad', nombre: 'Fiabilidad (vendedor + estado)' },
  { clave: 'descuento', nombre: 'Descuento vs mercado' },
  { clave: 'liquidez', nombre: 'Liquidez' },
];

export default function RadarScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [anadidos, setAnadidos] = useState<Record<string, boolean>>({});
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});
  const [pagina, setPagina] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [modo, setModo] = useState<Modo>('equilibradas');
  const [categoria, setCategoria] = useState('Todas');

  const POR_PAGINA = 5;
  const w = MODOS[modo].w;
  const categorias = ['Todas', ...Array.from(new Set((data?.productos ?? []).map((p) => p.categoria)))];
  const rankeados = (data?.productos ?? [])
    .filter((p) => categoria === 'Todas' || p.categoria === categoria)
    .map((p) => ({ p, s: score(p, w) }))
    .filter((x) => x.s >= minScore)
    .sort((a, b) => b.s - a.s);
  const totalPaginas = Math.max(1, Math.ceil(rankeados.length / POR_PAGINA));
  const visibles = rankeados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/catalogo');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar el radar');
      setData(json as Data);
      setPagina(0);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const anadir = (p: Producto) => {
    anadirItem({ nombre: p.nombre, fuente: 'ebay', query: p.nombre, precioCompra: p.precio_actual, fecha: new Date().toISOString().slice(0, 10) });
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
          <p className="text-slate-400">Combina potencial, fiabilidad, descuento y liquidez con datos reales de eBay.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-20">
            <Loader2 className="w-6 h-6 animate-spin" /> Analizando señales reales de eBay…
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Selector de modo */}
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-2">Modo de búsqueda:</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MODOS) as Modo[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setModo(m); setPagina(0); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${modo === m ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span>{MODOS[m].emoji}</span> {MODOS[m].label}
                    {m === 'equilibradas' && <span className="text-[10px] opacity-70">(recom.)</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por categoría (secciones) */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {categorias.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCategoria(c); setPagina(0); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${categoria === c ? 'bg-dark-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Filtro por score mínimo */}
            <div className="flex items-center gap-2 mb-5 text-sm">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Puntuación mínima:</span>
              {[0, 60, 70, 80].map((v) => (
                <button key={v} onClick={() => { setMinScore(v); setPagina(0); }} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${minScore === v ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {v === 0 ? 'Todas' : `≥ ${v}`}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {visibles.map(({ p, s }) => {
                const esc = escasez(p.escasez_nivel);
                return (
                  <div key={p.nombre} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{p.nombre}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-0.5">
                          <span>{p.categoria}</span>
                          <span className={`inline-flex items-center gap-1 ${esc.text}`}>{esc.dot} {esc.label}</span>
                          {p.lanzamiento && <span>· Lanzado {antiguedad(p.lanzamiento)}</span>}
                          {p.feedback_medio != null && <span className="inline-flex items-center gap-1"><Star className="w-3 h-3" /> {p.feedback_medio}% vendedor</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-3xl font-bold leading-none ${scoreColor(s)}`}>{s}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">score /100</p>
                        <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${recoBadge(s)}`}>{reco(s)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div><p className="text-[11px] text-slate-400">Mejor precio ahora</p><p className="font-bold text-slate-800">{p.precio_actual} €</p></div>
                      <div><p className="text-[11px] text-slate-400">Precio típico</p><p className="font-bold text-slate-800">{p.precio_tipico} €</p></div>
                      <div><p className="text-[11px] text-slate-400">Bajo el típico</p><p className="font-bold text-emerald-600">{p.descuento_pct > 0 ? `${p.descuento_pct}%` : '—'}</p></div>
                    </div>

                    <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary-500 shrink-0" />
                        <span className="text-sm font-semibold text-slate-800">Precio objetivo estimado: {p.estimacion.objetivo} €</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 ml-6">
                        Rango probable: {p.estimacion.min} – {p.estimacion.max} € · <span className="text-slate-400">estimación {p.estimacion.horizonte}, no un dato real</span>
                      </p>
                      <div className="flex items-center gap-2 mt-2 ml-6">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">Fiabilidad</span>
                        <div className="flex-1 max-w-[160px] h-1.5 rounded-full bg-slate-200" title={`Confianza ${p.confianza}%`}>
                          <div className={`h-1.5 rounded-full ${confColor(p.confianza)}`} style={{ width: `${p.confianza}%` }} />
                        </div>
                      </div>
                    </div>

                    <button onClick={() => setAbierto((a) => ({ ...a, [p.nombre]: !a[p.nombre] }))} className="text-xs font-semibold text-primary-600 hover:text-primary-700 mt-3">
                      {abierto[p.nombre] ? 'Ocultar' : 'Ver'} desglose ({MODOS[modo].emoji} {MODOS[modo].label})
                    </button>
                    {abierto[p.nombre] && (
                      <div className="mt-2 space-y-1.5">
                        {FACTORES.map((f) => {
                          const val = p.subscores[f.clave];
                          const peso = Math.round(w[f.clave] * 100);
                          return (
                            <div key={f.clave} className="flex items-center gap-2 text-xs">
                              <span className="w-44 shrink-0 text-slate-500">{f.nombre} <span className="text-slate-300">({peso}%)</span></span>
                              <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                                <div className="h-1.5 rounded-full bg-primary-500" style={{ width: `${val}%` }} />
                              </div>
                              <span className="w-14 text-right shrink-0 text-slate-500">{val}/100</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                      {p.tiendas.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-sm">
                          <span className="text-slate-400 w-4 shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-slate-700 truncate">{t.tienda}</span>
                            <span className="text-xs text-slate-400 ml-2">{t.condicion}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> disponible</span>
                          <span className="font-bold text-slate-800 w-20 text-right shrink-0">{t.precio} €</span>
                          <a href={t.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0">
                            Comprar <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <button onClick={() => anadir(p)} disabled={anadidos[p.nombre]} className="inline-flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60">
                        {anadidos[p.nombre] ? <><Check className="w-4 h-4 text-emerald-600" /> En inventario</> : <><PlusCircle className="w-4 h-4" /> Seguir en inventario</>}
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibles.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Ningún producto supera ese filtro en este modo.</p>}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                {rankeados.length > 0 ? `Mostrando ${pagina * POR_PAGINA + 1}–${Math.min((pagina + 1) * POR_PAGINA, rankeados.length)} de ${rankeados.length}` : ''}
              </p>
              <div className="flex items-center gap-4">
                <button onClick={() => { setPagina((p) => (p + 1) % totalPaginas); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={rankeados.length <= POR_PAGINA} className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                  <RefreshCw className="w-4 h-4" /> Ver otros 5
                </button>
                <button onClick={cargar} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">Recalcular precios</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
