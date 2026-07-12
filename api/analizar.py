"""
Endpoint serverless de Vercel para el motor de arbitraje (Flippr).

Ruta pública: POST /api/analizar
Recibe un JSON con el producto (fechas en formato ISO) y devuelve el informe
combinado de `analizar_oportunidad`.

Nota de despliegue: el motor vive en `_engine.py` (mismo directorio). Para que
Vercel lo encuentre en tiempo de ejecución añadimos su carpeta a sys.path de
forma explícita. Un GET devuelve un diagnóstico + la ayuda de uso.
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler
from typing import Any, Dict

# Aseguramos que el directorio de este archivo esté en sys.path para poder
# importar `_engine` esté donde esté el cwd del runtime.
_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

# Importamos el motor capturando cualquier error para poder reportarlo por JSON
# en lugar de provocar un 500 opaco a nivel de import de módulo.
_ENGINE_OK = False
_ENGINE_ERROR = None
try:
    from _engine import analizar_oportunidad  # type: ignore
    _ENGINE_OK = True
except Exception:  # noqa: BLE001
    _ENGINE_ERROR = traceback.format_exc()


def _parse_producto(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convierte las fechas ISO del JSON entrante en objetos date/datetime."""
    timing = dict(data.get("timing", {}) or {})
    tipo = timing.get("tipo")

    if tipo == "evento":
        if timing.get("fecha_evento"):
            timing["fecha_evento"] = date.fromisoformat(timing["fecha_evento"])
        timing["evolucion_stock"] = [
            (date.fromisoformat(f), int(n))
            for f, n in timing.get("evolucion_stock", [])
        ]
    elif tipo == "fisico":
        if timing.get("fecha_lanzamiento"):
            timing["fecha_lanzamiento"] = date.fromisoformat(timing["fecha_lanzamiento"])
        timing["historico_precios"] = [
            (date.fromisoformat(f), float(p))
            for f, p in timing.get("historico_precios", [])
        ]
    elif tipo == "rotura_stock":
        timing["historico_stock"] = [
            (datetime.fromisoformat(t), int(n))
            for t, n in timing.get("historico_stock", [])
        ]

    data["timing"] = timing
    return data


_AYUDA = {
    "endpoint": "/api/analizar",
    "metodo": "POST",
    "descripcion": "Analiza si merece la pena revender un producto y cuándo venderlo.",
    "ejemplo_body": {
        "nombre": "Entrada concierto",
        "precio_compra": 60,
        "historico_ventas": [120, 130, 125, 128, 400],
        "plataforma": "stubhub",
        "timing": {
            "tipo": "evento | fisico | rotura_stock",
            "fecha_evento": "2026-07-14 (solo evento, ISO)",
            "sold_out": True,
            "evolucion_stock": [["2026-06-22", 800], ["2026-07-11", 50]],
        },
    },
}


class handler(BaseHTTPRequestHandler):
    """Handler compatible con el runtime de Python de Vercel."""

    def _responder(self, codigo: int, payload: Dict[str, Any]) -> None:
        cuerpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_OPTIONS(self) -> None:  # preflight CORS
        self._responder(204, {})

    def do_GET(self) -> None:
        # Diagnóstico: confirma si el motor se importó y qué archivos hay al lado.
        try:
            archivos = sorted(os.listdir(_DIR))
        except Exception as exc:  # noqa: BLE001
            archivos = [f"<error listando: {exc}>"]
        self._responder(200, {
            "motor_importado": _ENGINE_OK,
            "error_import": _ENGINE_ERROR,
            "directorio": _DIR,
            "archivos": archivos,
            "ayuda": _AYUDA,
        })

    def do_POST(self) -> None:
        if not _ENGINE_OK:
            self._responder(500, {"error": "No se pudo cargar el motor", "detalle": _ENGINE_ERROR})
            return
        try:
            longitud = int(self.headers.get("content-length", 0) or 0)
            crudo = self.rfile.read(longitud) if longitud else b"{}"
            data = json.loads(crudo.decode("utf-8") or "{}")
            producto = _parse_producto(data)
            informe = analizar_oportunidad(producto)
            self._responder(200, informe)
        except (ValueError, KeyError) as exc:
            self._responder(400, {"error": str(exc), "tipo_error": type(exc).__name__})
        except Exception as exc:  # noqa: BLE001
            self._responder(500, {"error": "Error interno", "detalle": str(exc)})
