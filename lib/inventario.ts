// Inventario guardado en el navegador (localStorage). Sin cuentas ni backend:
// los datos viven solo en este dispositivo/navegador.

export interface ItemInventario {
  id: string;
  nombre: string;
  fuente: 'ebay' | 'discogs';
  query: string;
  precioCompra: number;
  fecha: string; // ISO (YYYY-MM-DD)
}

const CLAVE = 'flippr_inventario';

export function leerInventario(): ItemInventario[] {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? (JSON.parse(raw) as ItemInventario[]) : [];
  } catch {
    return [];
  }
}

function guardar(items: ItemInventario[]): void {
  localStorage.setItem(CLAVE, JSON.stringify(items));
}

export function anadirItem(item: Omit<ItemInventario, 'id'>): ItemInventario[] {
  const nuevo: ItemInventario = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  const items = [nuevo, ...leerInventario()];
  guardar(items);
  return items;
}

export function eliminarItem(id: string): ItemInventario[] {
  const items = leerInventario().filter((i) => i.id !== id);
  guardar(items);
  return items;
}
