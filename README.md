# Flippr

Analizador de arbitraje / reventa: dice si merece la pena revender un producto
(ROI real con comisiones por plataforma) y cuándo venderlo (timing por categoría).

App independiente (separada de RelevoPyme). Frontend Vite + React + Tailwind,
backend en funciones serverless de Vercel (`/api`).

## Estructura

- `screens/FlipprScreen.tsx` — interfaz del analizador.
- `api/_engine.py` — motor de análisis (viabilidad + timing). Solo librería estándar.
- `api/analizar.py` — endpoint `POST /api/analizar` (informe combinado).
- `api/precios-ebay.ts` — precios reales de eBay (Browse API oficial).
- `api/precios-discogs.ts` — precios reales de Discogs (música/coleccionables).
- `api/evento-ticketmaster.ts` — eventos reales de Ticketmaster (fecha + sold out).

## Desarrollo

```bash
npm install
npm run dev
```

## Variables de entorno (Vercel → Settings → Environment Variables)

Cada fuente de datos reales necesita su credencial. Sin ellas, el botón
correspondiente muestra un aviso y el resto sigue funcionando con datos manuales.

| Fuente | Variables | Coste |
|---|---|---|
| eBay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Gratis (developer.ebay.com) |
| Discogs | `DISCOGS_TOKEN` | Gratis (discogs.com/settings/developers) |
| Ticketmaster | `TICKETMASTER_API_KEY` | Gratis (developer.ticketmaster.com) |

## Despliegue

Repo conectado a Vercel: cada push a `main` despliega producción.
