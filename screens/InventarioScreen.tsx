import React, { useEffect, useState } from 'react';
import { Package, Loader2, Trash2, Plus } from 'lucide-react';
import { ItemInventario, leerInventario, anadirItem, eliminarItem } from '../lib/inventario';

interface Valor {
  cargando: boolean;
  valorActual?: number;
  error?: string;
}

// Estado de revalorización ACTUAL (no es predicción de futuro: no hay histórico).
function estadoMargen(pct: number) {
  if (pct >= 10) return { color: 'text-emerald-700', bg: 'bg-emerald-50', dot: '🟢', label: 'Se ha revalorizado' };
  if (pct >= 0) return { color: 'text-amber-700', bg: 'bg-amber-50', dot: '🟡', label: 'Estable' };
  return { color: 'text-red-700', bg: 'bg-red-50', dot: '🔴', label: 'Ha bajado' };
}

const diasDesde = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

export default function InventarioScreen() {
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [mostrarForm, setMostrarForm] = useState(false);

  // Formulario de alta manual.
  const [nombre, setNombre] = useState('');
  const [fuente, setFuente] = useState<'ebay' | 'discogs'>('ebay');
  const [precioCompra, setPrecioCompra] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  const cargarValor = async (item: ItemInventario) => {
    setValores((v) => ({ ...v, [item.id]: { cargando: true } }));
    try {
      const endpoint = item.fuente === 'discogs' ? 'precios-discogs' : 'precios-ebay';
      const res = await fetch(`/api/${endpoint}?q=${encodeURIComponent(item.query)}`);
      const data = await res.json();
      if (!res.ok || data.mediana == null) throw new Error(data.error || data.mensaje || 'Sin precio');
      setValores((v) => ({ ...v, [item.id]: { cargando: false, valorActual: Number(data.mediana) } }));
    } catch (err: any) {
      setValores((v) => ({ ...v, [item.id]: { cargando: false, error: err.message || 'Error' } }));
    }
  };

  const recargar = (lista: ItemInventario[]) => {
    setItems(lista);
    lista.forEach(cargarValor);
  };

  useEffect(() => {
    recargar(leerInventario());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const precio = Number(precioCompra.replace(',', '.'));
    if (!nombre.trim() || !Number.isFinite(precio) || precio <= 0) return;
    const lista = anadirItem({ nombre: nombre.trim(), fuente, query: nombre.trim(), precioCompra: precio, fecha });
    setNombre('');
    setPrecioCompra('');
    setMostrarForm(false);
    recargar(lista);
  };

  const borrar = (id: string) => setItems(eliminarItem(id));

  const inputCls = 'w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-dark-900 text-white py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-7 h-7 text-primary-500" />
              <h1 className="text-3xl font-bold font-heading">Mi inventario</h1>
            </div>
            <p className="text-slate-400">Zona de venta: lo que compraste, con su valor de mercado actual real.</p>
          </div>
          <button
            onClick={() => setMostrarForm((m) => !m)}
            className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> Añadir
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {mostrarForm && (
          <form onSubmit={guardar} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Producto</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: LEGO 75192 Millennium Falcon" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fuente de precio</label>
              <select value={fuente} onChange={(e) => setFuente(e.target.value as 'ebay' | 'discogs')} className={inputCls}>
                <option value="ebay">eBay</option>
                <option value="discogs">Discogs (música)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de compra (€)</label>
              <input value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} placeholder="50" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha de compra</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                Guardar en inventario
              </button>
            </div>
          </form>
        )}

        {items.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Tu inventario está vacío.</p>
            <p className="text-sm">Añade productos desde el Radar o con el botón "Añadir".</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const v = valores[item.id];
              const valor = v?.valorActual;
              // Revalorización = valor de mercado actual vs lo que pagaste (sin comisiones).
              const revalor = valor != null ? valor - item.precioCompra : null;
              const revalorPct = revalor != null ? (revalor / item.precioCompra) * 100 : null;
              const est = revalorPct != null ? estadoMargen(revalorPct) : null;
              return (
                <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{item.nombre}</p>
                      <p className="text-xs text-slate-400">
                        Comprado por {item.precioCompra} € · hace {diasDesde(item.fecha)} días · {item.fuente}
                      </p>
                    </div>
                    {est && (
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${est.bg} ${est.color}`}>
                        {est.dot} {est.label}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div>
                      <p className="text-[11px] text-slate-400">Valor de mercado</p>
                      {v?.cargando ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400 mt-1" />
                      ) : v?.error ? (
                        <p className="text-xs text-slate-400">sin dato</p>
                      ) : (
                        <p className="font-bold text-slate-800">{valor} €</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Revalorización</p>
                      <p className={`font-bold ${revalor != null && revalor >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {revalor != null ? `${revalor >= 0 ? '+' : ''}${Math.round(revalor * 100) / 100} €` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">% cambio</p>
                      <p className={`font-bold ${revalorPct != null && revalorPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {revalorPct != null ? `${revalorPct >= 0 ? '+' : ''}${Math.round(revalorPct * 10) / 10} %` : '—'}
                      </p>
                    </div>
                    <div className="flex items-end justify-end">
                      <button onClick={() => borrar(item.id)} className="text-slate-400 hover:text-red-600 transition-colors p-2" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-6">
          El estado (🟢🟡🔴) refleja la <strong>revalorización actual</strong> (valor de mercado de hoy vs lo que pagaste),
          no una predicción de futuro. Los datos se guardan solo en este navegador.
        </p>
      </div>
    </div>
  );
}
