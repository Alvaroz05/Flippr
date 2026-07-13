import React, { useState, useEffect } from 'react';
import { Calculator, TrendingUp, Clock, AlertCircle, CheckCircle, XCircle, Loader2, Download } from 'lucide-react';

type TipoTiming = 'evento' | 'fisico' | 'rotura_stock';

interface Informe {
  nombre: string;
  rentable: boolean;
  viabilidad: {
    plataforma: string;
    precio_compra: number;
    precio_venta_estimado: number;
    comisiones: number;
    beneficio_neto: number;
    roi_pct: number;
    veredicto: string;
    detalle_tarifa: string;
    muestras_historico: number;
  };
  timing: {
    recomendacion: string;
    alerta: string;
    [k: string]: unknown;
  };
  resumen: string;
}

const PLATAFORMAS = ['ebay', 'wallapop', 'vinted', 'stubhub', 'viagogo', 'amazon'];
const CATEGORIAS = ['juguetes', 'electronica', 'coleccionables', 'material_escolar'];

// Convierte un textarea de líneas "fecha,valor" en pares [fecha, número].
const parseSerie = (texto: string): [string, number][] =>
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [f, v] = l.split(',').map((s) => s.trim());
      return [f, Number(v)] as [string, number];
    });

// Colores del veredicto de viabilidad.
const veredictoStyle = (v: string) => {
  if (v === 'RENTABLE') return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', Icon: CheckCircle };
  if (v === 'AJUSTADO') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', Icon: AlertCircle };
  return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', Icon: XCircle };
};

export default function FlipprScreen({ productoInicial }: { productoInicial?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);

  // Estado de la carga de precios reales desde eBay.
  const [cargandoEbay, setCargandoEbay] = useState(false);
  const [avisoEbay, setAvisoEbay] = useState<string | null>(null);

  // Estado de la búsqueda de evento en Ticketmaster.
  const [cargandoTM, setCargandoTM] = useState(false);
  const [avisoTM, setAvisoTM] = useState<string | null>(null);

  // Estado de la carga de precios reales desde Discogs (música/coleccionables).
  const [cargandoDiscogs, setCargandoDiscogs] = useState(false);

  // Viabilidad
  const [nombre, setNombre] = useState(productoInicial || '');

  // Si llegamos desde el catálogo con un producto, lo precargamos.
  useEffect(() => {
    if (productoInicial) setNombre(productoInicial);
  }, [productoInicial]);
  const [precioCompra, setPrecioCompra] = useState('');
  const [plataforma, setPlataforma] = useState('ebay');
  const [historicoVentas, setHistoricoVentas] = useState('');

  // Timing
  const [tipo, setTipo] = useState<TipoTiming>('evento');
  const [fechaEvento, setFechaEvento] = useState('');
  const [soldOut, setSoldOut] = useState(false);
  const [evolucionStock, setEvolucionStock] = useState('');
  const [categoria, setCategoria] = useState('juguetes');
  const [fechaLanzamiento, setFechaLanzamiento] = useState('');
  const [historicoPrecios, setHistoricoPrecios] = useState('');
  const [tienda, setTienda] = useState('Amazon');
  const [historicoStock, setHistoricoStock] = useState('');

  const construirTiming = () => {
    if (tipo === 'evento') {
      return {
        tipo,
        fecha_evento: fechaEvento,
        sold_out: soldOut,
        evolucion_stock: parseSerie(evolucionStock),
      };
    }
    if (tipo === 'fisico') {
      return {
        tipo,
        categoria,
        fecha_lanzamiento: fechaLanzamiento,
        historico_precios: parseSerie(historicoPrecios),
      };
    }
    return {
      tipo,
      tienda,
      historico_stock: parseSerie(historicoStock),
    };
  };

  // Trae precios reales de eBay para el término (usa el nombre del producto).
  const traerPreciosEbay = async () => {
    const q = nombre.trim();
    if (!q) {
      setAvisoEbay('Escribe primero el nombre del producto para buscar en eBay.');
      return;
    }
    setCargandoEbay(true);
    setAvisoEbay(null);
    try {
      const res = await fetch(`/api/precios-ebay?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al consultar eBay');
      if (!data.precios || data.precios.length === 0) {
        setAvisoEbay(data.mensaje || 'Sin resultados en eBay para esa búsqueda.');
        return;
      }
      setHistoricoVentas(data.precios.join(', '));
      setPlataforma('ebay');
      setAvisoEbay(`${data.n} precios reales de eBay (${data.marketplace}). ${data.aviso}`);
    } catch (err: any) {
      setAvisoEbay(err.message || 'No se pudo consultar eBay.');
    }
    setCargandoEbay(false);
  };

  // Busca el evento real en Ticketmaster y rellena fecha + sold out.
  const buscarEventoTM = async () => {
    const q = nombre.trim();
    if (!q) {
      setAvisoTM('Escribe primero el nombre del evento para buscarlo.');
      return;
    }
    setCargandoTM(true);
    setAvisoTM(null);
    try {
      const res = await fetch(`/api/evento-ticketmaster?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al consultar Ticketmaster');
      if (!data.encontrado) {
        setAvisoTM(data.mensaje || 'No se encontró el evento.');
        return;
      }
      if (data.fecha_evento) setFechaEvento(data.fecha_evento);
      setSoldOut(Boolean(data.sold_out_estimado));
      setAvisoTM(`${data.nombre} · ${data.fecha_evento ?? 'sin fecha'} · ${data.aviso}`);
    } catch (err: any) {
      setAvisoTM(err.message || 'No se pudo consultar Ticketmaster.');
    }
    setCargandoTM(false);
  };

  // Trae precios reales de Discogs (música/coleccionables).
  const traerPreciosDiscogs = async () => {
    const q = nombre.trim();
    if (!q) {
      setAvisoEbay('Escribe primero el nombre del disco/artículo para buscar en Discogs.');
      return;
    }
    setCargandoDiscogs(true);
    setAvisoEbay(null);
    try {
      const res = await fetch(`/api/precios-discogs?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al consultar Discogs');
      if (!data.precios || data.precios.length === 0) {
        setAvisoEbay(data.mensaje || 'Sin resultados en Discogs.');
        return;
      }
      setHistoricoVentas(data.precios.join(', '));
      setAvisoEbay(`${data.n} precios reales de Discogs${data.moneda ? ` (${data.moneda})` : ''}. ${data.aviso}`);
    } catch (err: any) {
      setAvisoEbay(err.message || 'No se pudo consultar Discogs.');
    }
    setCargandoDiscogs(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInforme(null);
    try {
      const ventas = historicoVentas
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);

      const res = await fetch('/api/analizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          precio_compra: Number(precioCompra),
          historico_ventas: ventas,
          plataforma,
          timing: construirTiming(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al analizar');
      setInforme(data as Informe);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    }
    setLoading(false);
  };

  const inputCls =
    'w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-dark-900 text-white py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <Calculator className="w-7 h-7 text-primary-500" />
            <h1 className="text-3xl font-bold font-heading">Flippr</h1>
          </div>
          <p className="text-slate-400">
            Comprueba si merece la pena revender un producto (ROI real con comisiones por plataforma) y cuándo venderlo.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Viabilidad */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-7">
            <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-600" /> Viabilidad (ROI)
            </h2>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del producto</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Entrada concierto / LEGO edición limitada" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de compra (€) <span className="text-red-500">*</span></label>
                <input required type="number" step="0.01" value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} placeholder="50" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Plataforma <span className="text-red-500">*</span></label>
                <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)} className={inputCls}>
                  {PLATAFORMAS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-700">
                    Histórico de precios (€) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={traerPreciosEbay}
                      disabled={cargandoEbay}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50"
                    >
                      {cargandoEbay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Precios eBay
                    </button>
                    <button
                      type="button"
                      onClick={traerPreciosDiscogs}
                      disabled={cargandoDiscogs}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50"
                    >
                      {cargandoDiscogs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Precios Discogs
                    </button>
                  </div>
                </div>
                <input required value={historicoVentas} onChange={(e) => setHistoricoVentas(e.target.value)} placeholder="88, 90, 92, 150, 89" className={inputCls} />
                <p className="text-xs text-slate-400 mt-1">Precios separados por comas. Se usa la mediana (ignora outliers).</p>
                {avisoEbay && <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{avisoEbay}</p>}
              </div>
            </div>
          </div>

          {/* Timing */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-7">
            <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary-600" /> Timing (cuándo vender)
            </h2>

            <div className="flex flex-wrap gap-2 mb-5">
              {([
                ['evento', 'Entradas de evento'],
                ['fisico', 'Producto físico'],
                ['rotura_stock', 'Rotura de stock'],
              ] as [TipoTiming, string][]).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTipo(val)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    tipo === val ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tipo === 'evento' && (
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={buscarEventoTM}
                    disabled={cargandoTM}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    {cargandoTM ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Buscar evento real en Ticketmaster (rellena fecha y sold out)
                  </button>
                  {avisoTM && <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{avisoTM}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha del evento</label>
                  <input type="date" value={fechaEvento} onChange={(e) => setFechaEvento(e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 pb-2.5">
                    <input type="checkbox" checked={soldOut} onChange={(e) => setSoldOut(e.target.checked)} className="w-4 h-4 accent-primary-600" />
                    Evento agotado (sold out)
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Evolución del stock en reventa</label>
                  <textarea rows={3} value={evolucionStock} onChange={(e) => setEvolucionStock(e.target.value)} placeholder={'2026-06-22, 800\n2026-07-07, 200\n2026-07-11, 50'} className={`${inputCls} resize-none font-mono`} />
                  <p className="text-xs text-slate-400 mt-1">Una línea por medición: <code>fecha, nº entradas</code>.</p>
                </div>
              </div>
            )}

            {tipo === 'fisico' && (
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha de lanzamiento</label>
                  <input type="date" value={fechaLanzamiento} onChange={(e) => setFechaLanzamiento(e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Histórico de precios (opcional)</label>
                  <textarea rows={3} value={historicoPrecios} onChange={(e) => setHistoricoPrecios(e.target.value)} placeholder={'2024-11-15, 65\n2024-06-15, 40\n2025-11-15, 66'} className={`${inputCls} resize-none font-mono`} />
                  <p className="text-xs text-slate-400 mt-1">Una línea por dato: <code>fecha, precio</code>. Con &gt;1 año detecta el patrón estacional real.</p>
                </div>
              </div>
            )}

            {tipo === 'rotura_stock' && (
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tienda</label>
                  <input value={tienda} onChange={(e) => setTienda(e.target.value)} placeholder="Amazon" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Histórico de stock</label>
                  <textarea rows={3} value={historicoStock} onChange={(e) => setHistoricoStock(e.target.value)} placeholder={'2026-07-08T10:00, 12\n2026-07-10T10:00, 3\n2026-07-11T10:00, 0'} className={`${inputCls} resize-none font-mono`} />
                  <p className="text-xs text-slate-400 mt-1">Una línea por medición: <code>fecha/hora, stock</code>. Detecta la caída a 0.</p>
                </div>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calculator className="w-5 h-5" />}
            {loading ? 'Analizando...' : 'Analizar oportunidad'}
          </button>
        </form>

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {informe && (() => {
          const v = informe.viabilidad;
          const st = veredictoStyle(v.veredicto);
          const { Icon } = st;
          return (
            <div className="mt-8 space-y-5">
              {/* Veredicto */}
              <div className={`${st.bg} ${st.border} border rounded-2xl p-6`}>
                <div className={`flex items-center gap-2 ${st.text} font-bold text-lg mb-1`}>
                  <Icon className="w-6 h-6" /> {v.veredicto}
                </div>
                <p className="text-slate-600 text-sm">{informe.resumen}</p>
              </div>

              {/* Números */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Desglose de viabilidad</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    ['Venta estimada', `${v.precio_venta_estimado} €`],
                    ['Comisiones', `${v.comisiones} €`],
                    ['Beneficio neto', `${v.beneficio_neto} €`],
                    ['ROI', `${v.roi_pct} %`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                      <p className={`text-xl font-bold ${label === 'ROI' || label === 'Beneficio neto' ? st.text : 'text-slate-900'}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-4">{v.detalle_tarifa} · {v.muestras_historico} ventas de muestra</p>
              </div>

              {/* Timing */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-bold text-slate-900">{informe.timing.recomendacion.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-sm text-slate-600">{informe.timing.alerta}</p>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
