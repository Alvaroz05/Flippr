import React, { useState } from 'react';
import { LayoutGrid, Calculator } from 'lucide-react';
import CatalogoScreen from './screens/CatalogoScreen';
import FlipprScreen from './screens/FlipprScreen';

type Tab = 'catalogo' | 'analizar';

const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>('catalogo');
  const [prefill, setPrefill] = useState('');

  // Desde el catálogo: precarga el producto y salta al analizador.
  const irAAnalizar = (nombre: string) => {
    setPrefill(nombre);
    setTab('analizar');
  };

  const tabBtn = (id: Tab, label: string, Icon: typeof Calculator) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        tab === id ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="text-xl font-[900] tracking-tighter text-slate-900">
            Flip<span className="text-primary-600">pr</span>
          </span>
          <nav className="flex items-center gap-2">
            {tabBtn('catalogo', 'Catálogo', LayoutGrid)}
            {tabBtn('analizar', 'Analizador', Calculator)}
          </nav>
        </div>
      </header>

      {tab === 'catalogo' ? (
        <CatalogoScreen onAnalizar={irAAnalizar} />
      ) : (
        <FlipprScreen productoInicial={prefill} />
      )}
    </div>
  );
};

export default App;
