import React, { useEffect, useState } from 'react';
import { Radar, Loader2, XCircle, RefreshCw, PlusCircle, Check, ExternalLink, Clock } from 'lucide-react';
import { anadirItem } from '../lib/inventario';

interface Tienda {
  tienda: string;
  precio: number;
  moneda: string;
  condicion: string;
  disponible: boolean;
  url: string;
}
interface Producto {
  nombre: string;
  categoria: string;
  precio_actual: number;
  precio_tipico: number;
  descuento_pct: number;
  stock: number;
  comprobado: string;
  tiendas: Tienda[];
}
interface Data {
  generado: string;
  nota: string;
  productos: Producto[];
}

export default function RadarScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [anadidos, setAnadidos] = useState<Record<string, boolean>>({});

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/catalogo');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar el radar');
      setData(json as Data);
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const anadir = (p: Producto) => {
    anadirItem({
      nombre: p.nombre,
      fuente: 'ebay',
      query: p.nombre,
      precioCompra: p.precio_actual,
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
            <h1 className="text-3xl font-bold font-heading">Radar de stock</h1>
          </div>
          <p className="text-slate-400">
            Productos con reventa activa y stock real en eBay, ordenados por la mejor oferta de ahora.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-20">
            <Loader2 className="w-6 h-6 animate-spin" /> Buscando stock y precios reales en eBay…
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {data && !loading && (
          <>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6 text-sm text-amber-800">
              <strong>Precio futuro:</strong> no se muestra porque aún no hay histórico real para estimarlo (sería inventado).
              Se activará cuando registremos precios en el tiempo o conectemos Keepa. {data.nota}
            </div>

            <div className="space-y-4">
              {data.productos.map((p) => (
                <div key={p.nombre} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{p.nombre}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-0.5">
                        <span>{p.categoria}</span>
                        <span>· {p.stock} con stock</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(p.comprobado).toLocaleString('es-ES')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-slate-900">{p.precio_actual} €</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">mejor precio</p>
                      {p.descuento_pct > 0 && (
                        <span className="inline-block mt-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {p.descuento_pct}% bajo el típico ({p.precio_tipico} €)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tiendas (vendedores) con stock, ordenadas por precio */}
                  <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                    {p.tiendas.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-sm">
                        <span className="text-slate-400 w-4 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-slate-700 truncate">{t.tienda}</span>
                          <span className="text-xs text-slate-400 ml-2">{t.condicion}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> disponible
                        </span>
                        <span className="font-bold text-slate-800 w-20 text-right shrink-0">{t.precio} €</span>
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
                        >
                          Comprar <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={() => anadir(p)}
                      disabled={anadidos[p.nombre]}
                      className="inline-flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                    >
                      {anadidos[p.nombre] ? (
                        <><Check className="w-4 h-4 text-emerald-600" /> En inventario</>
                      ) : (
                        <><PlusCircle className="w-4 h-4" /> Seguir en inventario</>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-slate-400">Comprobado: {new Date(data.generado).toLocaleString('es-ES')}</p>
              <button onClick={cargar} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">
                <RefreshCw className="w-4 h-4" /> Comprobar stock ahora
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
