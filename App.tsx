import React, { useState } from 'react';
import { Radar, Package, Calculator, TrendingUp } from 'lucide-react';
import RadarScreen from './screens/RadarScreen';
import InventarioScreen from './screens/InventarioScreen';
import InversionScreen from './screens/InversionScreen';
import FlipprScreen from './screens/FlipprScreen';

type Tab = 'radar' | 'inversion' | 'inventario' | 'analizar';

const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>('radar');

  const tabBtn = (id: Tab, label: string, Icon: typeof Calculator) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        tab === id ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="text-xl font-[900] tracking-tighter text-slate-900">
            Flip<span className="text-primary-600">pr</span>
          </span>
          <nav className="flex items-center gap-1 sm:gap-2">
            {tabBtn('radar', 'Radar', Radar)}
            {tabBtn('inversion', 'Inversión', TrendingUp)}
            {tabBtn('inventario', 'Inventario', Package)}
            {tabBtn('analizar', 'Analizador', Calculator)}
          </nav>
        </div>
      </header>

      {tab === 'radar' && <RadarScreen />}
      {tab === 'inversion' && <InversionScreen />}
      {tab === 'inventario' && <InventarioScreen />}
      {tab === 'analizar' && <FlipprScreen />}
    </div>
  );
};

export default App;
