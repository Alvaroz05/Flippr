"""
Motor de análisis para una app de arbitraje / reventa.

Compras barato, y este motor te dice:
  1) Si merece la pena revender (ROI real, no una comisión genérica del 15%).
  2) Cuándo venderlo (timing según el tipo de producto).
  3) Un único informe que combina ambas cosas.

Diseño en tres módulos independientes que luego se orquestan:
  - Módulo 1: `ViabilityCalculator`  -> ¿es rentable?
  - Módulo 2: `TimingEngine`         -> ¿cuándo vendo?
  - Módulo 3: `analizar_oportunidad` -> informe combinado.

Todo con type hints, docstrings y un bloque `__main__` con datos de prueba.
No requiere dependencias externas (solo la librería estándar).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Sequence, Tuple


# =============================================================================
# MÓDULO 1 — Calculadora de viabilidad (ROI real)
# =============================================================================


@dataclass(frozen=True)
class TarifaPlataforma:
    """Estructura de comisiones de una plataforma de venta.

    Se separan los distintos conceptos porque en la vida real no es un
    porcentaje único: hay comisión de venta, comisión de pago/gestión, una
    tarifa fija por operación y, a veces, el envío que absorbe el vendedor.

    Atributos:
        comision_venta_pct: Comisión de venta como fracción (0.12 = 12 %).
        comision_pago_pct: Comisión de pago/gestión como fracción.
        tarifa_fija_eur: Cargo fijo por operación, en euros.
        coste_envio_vendedor_eur: Envío que asume el vendedor (0 si lo paga
            el comprador). En muchas plataformas C2C el envío lo paga quien
            compra, así que por defecto es 0.
        nota: Aclaración/fuente para poder auditar y actualizar la tarifa.
    """

    comision_venta_pct: float
    comision_pago_pct: float
    tarifa_fija_eur: float
    coste_envio_vendedor_eur: float = 0.0
    nota: str = ""

    def comisiones_totales(self, precio_venta: float) -> float:
        """Devuelve las comisiones totales en euros para un precio de venta dado."""
        variable = precio_venta * (self.comision_venta_pct + self.comision_pago_pct)
        return round(variable + self.tarifa_fija_eur + self.coste_envio_vendedor_eur, 2)


# -----------------------------------------------------------------------------
# TARIFAS_PLATAFORMA
#
# IMPORTANTE: estas cifras CAMBIAN con frecuencia. Están pensadas para editarse
# fácilmente. Son valores orientativos para el mercado español a fecha de
# escritura (revísalos contra la web oficial de cada plataforma antes de fiarte).
#
# Muchas plataformas C2C (Wallapop, Vinted) NO cobran al vendedor: la comisión
# la paga el comprador vía "protección de compra". Por eso su comisión de
# vendedor es ~0. eBay y StubHub sí cobran al vendedor.
# -----------------------------------------------------------------------------
TARIFAS_PLATAFORMA: Dict[str, TarifaPlataforma] = {
    "ebay": TarifaPlataforma(
        comision_venta_pct=0.115,   # ~11,5 % variable según categoría
        comision_pago_pct=0.0,      # gestión de pagos ya incluida en la de venta
        tarifa_fija_eur=0.35,       # cargo fijo por pedido
        coste_envio_vendedor_eur=0.0,
        nota="eBay ES: ~11,5% + 0,35€/pedido. Varía mucho por categoría.",
    ),
    "wallapop": TarifaPlataforma(
        comision_venta_pct=0.0,     # publicar y vender es gratis para el vendedor
        comision_pago_pct=0.0,
        tarifa_fija_eur=0.0,
        coste_envio_vendedor_eur=0.0,
        nota="Wallapop: gratis para el vendedor; la protección la paga el comprador.",
    ),
    "vinted": TarifaPlataforma(
        comision_venta_pct=0.0,     # el vendedor no paga comisión
        comision_pago_pct=0.0,
        tarifa_fija_eur=0.0,
        coste_envio_vendedor_eur=0.0,
        nota="Vinted: 0% al vendedor; comprador paga protección (~5% + fija).",
    ),
    "stubhub": TarifaPlataforma(
        comision_venta_pct=0.10,    # comisión al vendedor de entradas
        comision_pago_pct=0.0,
        tarifa_fija_eur=0.0,
        coste_envio_vendedor_eur=0.0,
        nota="StubHub: ~10% al vendedor (además el comprador paga su propia fee).",
    ),
    "viagogo": TarifaPlataforma(
        comision_venta_pct=0.10,
        comision_pago_pct=0.0,
        tarifa_fija_eur=0.0,
        coste_envio_vendedor_eur=0.0,
        nota="Viagogo: ~10-15% al vendedor. Revisar por evento/país.",
    ),
    "amazon": TarifaPlataforma(
        comision_venta_pct=0.15,    # referral fee típica ~15%
        comision_pago_pct=0.0,
        tarifa_fija_eur=0.0,        # (FBA añadiría tarifas de logística aparte)
        coste_envio_vendedor_eur=3.0,
        nota="Amazon: referral ~15% (varía por categoría). FBA suma logística.",
    ),
}


class Veredicto(str, Enum):
    """Veredicto de rentabilidad."""

    RENTABLE = "RENTABLE"
    AJUSTADO = "AJUSTADO"
    NO_RENTABLE = "NO RENTABLE"


@dataclass(frozen=True)
class UmbralesVeredicto:
    """Umbrales de ROI (en %) para clasificar la operación.

    Configurable: por defecto ROI > 30 % es rentable, 10-30 % ajustado y
    < 10 % no rentable.
    """

    rentable_min_pct: float = 30.0
    ajustado_min_pct: float = 10.0


class ViabilityCalculator:
    """Calcula el ROI real de revender un producto en una plataforma concreta."""

    def __init__(
        self,
        precio_compra: float,
        historico_ventas: Sequence[float],
        plataforma: str,
        umbrales: UmbralesVeredicto = UmbralesVeredicto(),
        tarifas: Optional[Dict[str, TarifaPlataforma]] = None,
    ) -> None:
        """
        Args:
            precio_compra: Lo que te cuesta adquirir el artículo.
            historico_ventas: Precios de las últimas N VENTAS COMPLETADAS
                (no listados activos: los activos mienten sobre el precio real).
            plataforma: Clave de `TARIFAS_PLATAFORMA` ("ebay", "wallapop"...).
            umbrales: Umbrales de veredicto configurables.
            tarifas: Tabla de tarifas a usar (por defecto la global editable).

        Raises:
            ValueError: si el histórico está vacío o el precio de compra es <= 0.
            KeyError: si la plataforma no está en la tabla de tarifas.
        """
        if precio_compra <= 0:
            raise ValueError("El precio de compra debe ser mayor que 0.")
        if not historico_ventas:
            raise ValueError(
                "historico_ventas está vacío: sin ventas completadas no hay "
                "estimación fiable de precio."
            )

        self.precio_compra = float(precio_compra)
        self.historico_ventas = list(historico_ventas)
        self.plataforma = plataforma.lower().strip()
        self.umbrales = umbrales
        self.tarifas = tarifas if tarifas is not None else TARIFAS_PLATAFORMA

        if self.plataforma not in self.tarifas:
            raise KeyError(
                f"Plataforma '{self.plataforma}' desconocida. "
                f"Disponibles: {sorted(self.tarifas)}"
            )

    def _precio_venta_estimado(self) -> float:
        """Mediana del histórico (robusta frente a outliers, a diferencia de la media)."""
        return round(statistics.median(self.historico_ventas), 2)

    def _veredicto(self, roi_pct: float) -> Veredicto:
        if roi_pct >= self.umbrales.rentable_min_pct:
            return Veredicto.RENTABLE
        if roi_pct >= self.umbrales.ajustado_min_pct:
            return Veredicto.AJUSTADO
        return Veredicto.NO_RENTABLE

    def calcular(self) -> Dict[str, object]:
        """Ejecuta el cálculo y devuelve un dict estructurado con el resultado."""
        tarifa = self.tarifas[self.plataforma]
        precio_venta = self._precio_venta_estimado()
        comisiones = tarifa.comisiones_totales(precio_venta)
        beneficio_neto = round(precio_venta - self.precio_compra - comisiones, 2)
        roi_pct = round(beneficio_neto / self.precio_compra * 100, 2)
        veredicto = self._veredicto(roi_pct)

        return {
            "plataforma": self.plataforma,
            "precio_compra": round(self.precio_compra, 2),
            "precio_venta_estimado": precio_venta,
            "comisiones": comisiones,
            "beneficio_neto": beneficio_neto,
            "roi_pct": roi_pct,
            "veredicto": veredicto.value,
            "detalle_tarifa": tarifa.nota,
            "muestras_historico": len(self.historico_ventas),
        }


# =============================================================================
# MÓDULO 2 — Motor de timing (cuándo vender)
# =============================================================================


class Recomendacion(str, Enum):
    """Acciones de timing que puede recomendar el motor."""

    SUBIR_PRECIO_YA = "SUBIR_PRECIO_YA"
    VENDER_YA = "VENDER_YA"
    ESPERAR = "ESPERAR"
    GUARDAR_HASTA_TEMPORADA = "GUARDAR_HASTA_TEMPORADA"
    VIGILAR = "VIGILAR"
    SIN_SENAL = "SIN_SENAL"


# Ventanas estacionales típicas por categoría, como respaldo cuando no hay
# suficiente histórico para detectar el patrón con datos reales. (mes, día).
VENTANAS_ESTACIONALES: Dict[str, Tuple[Tuple[int, int], Tuple[int, int], str]] = {
    "juguetes": ((11, 15), (12, 24), "Campaña de Navidad"),
    "electronica": ((11, 20), (11, 30), "Black Friday / Cyber Monday"),
    "coleccionables": ((11, 15), (12, 31), "Navidad + regalos de fin de año"),
    "material_escolar": ((8, 20), (9, 15), "Vuelta al cole"),
}


class TimingEngine:
    """Decide el mejor momento de venta según la naturaleza del producto.

    Tres lógicas distintas:
      A) Entradas de eventos  -> curva en "U".
      B) Productos físicos     -> estacionalidad recurrente.
      C) Alerta de rotura de stock en tiendas grandes.
    """

    def __init__(self, hoy: Optional[date] = None) -> None:
        """
        Args:
            hoy: Fecha de referencia (inyectable para tests). Por defecto, hoy.
        """
        self.hoy: date = hoy or date.today()

    # ---------------------------------------------------------------- A) Eventos
    def analizar_entradas_evento(
        self,
        fecha_evento: date,
        sold_out: bool,
        evolucion_stock: Sequence[Tuple[date, int]],
    ) -> Dict[str, object]:
        """Analiza entradas de un evento con lógica de curva en "U".

        Intuición de la curva:
          - Recién salidas a la venta: precio alto por novedad/FOMO.
          - Mitad del ciclo: bajan (mucha oferta, evento lejano) -> mínimo.
          - Últimas 48-72 h: si hay sold out, suben con fuerza.

        Args:
            fecha_evento: Fecha del evento.
            sold_out: Si el evento está agotado en canal oficial.
            evolucion_stock: Serie [(fecha, nº entradas disponibles en reventa)].

        Returns:
            dict con días restantes, caída de stock, recomendación y alerta.
        """
        dias_restantes = (fecha_evento - self.hoy).days

        serie = sorted(evolucion_stock, key=lambda x: x[0])
        stock_inicial = serie[0][1] if serie else 0
        stock_actual = serie[-1][1] if serie else 0
        if stock_inicial > 0:
            caida_pct = round((stock_inicial - stock_actual) / stock_inicial * 100, 1)
        else:
            caida_pct = 0.0

        # Reglas de la curva en "U" combinando tiempo restante + presión de stock.
        if dias_restantes < 0:
            recomendacion = Recomendacion.VENDER_YA
            alerta = "El evento ya ha pasado: vende ya cualquier stock residual."
        elif dias_restantes <= 3 and sold_out:
            recomendacion = Recomendacion.SUBIR_PRECIO_YA
            alerta = (
                f"Faltan {dias_restantes} días, sold out y el stock de reventa "
                f"ha bajado un {caida_pct}% → estás en la subida final, sube el precio ahora."
            )
        elif dias_restantes <= 3 and not sold_out:
            recomendacion = Recomendacion.VENDER_YA
            alerta = (
                f"Faltan {dias_restantes} días y NO hay sold out: el pico final es "
                "improbable. Vende ya antes de que quedes con la entrada en la mano."
            )
        elif caida_pct >= 60 and sold_out:
            recomendacion = Recomendacion.SUBIR_PRECIO_YA
            alerta = (
                f"El stock de reventa ha caído un {caida_pct}% y hay sold out "
                f"({dias_restantes} días para el evento) → la oferta se agota, sube el precio."
            )
        elif dias_restantes > 21:
            recomendacion = Recomendacion.ESPERAR
            alerta = (
                f"Quedan {dias_restantes} días (fase inicial de la curva). Los precios "
                "suelen bajar hacia la mitad del ciclo: no malvendas todavía."
            )
        else:
            recomendacion = Recomendacion.ESPERAR
            alerta = (
                f"Zona media del ciclo ({dias_restantes} días, caída de stock "
                f"{caida_pct}%). Probable zona de mínimo: espera al repunte final si hay sold out."
            )

        return {
            "tipo": "evento",
            "dias_restantes": dias_restantes,
            "sold_out": sold_out,
            "stock_inicial": stock_inicial,
            "stock_actual": stock_actual,
            "caida_stock_pct": caida_pct,
            "recomendacion": recomendacion.value,
            "alerta": alerta,
        }

    # -------------------------------------------------------- B) Productos físicos
    def analizar_producto_fisico(
        self,
        categoria: str,
        fecha_lanzamiento: date,
        historico_precios: Sequence[Tuple[date, float]],
    ) -> Dict[str, object]:
        """Detecta estacionalidad en el precio de un producto físico.

        Estrategia:
          1. Si hay histórico que cubre >1 año, busca el mes cuyo precio medio
             es máximo y comprueba si ese pico se repite entre años (patrón real).
          2. Si no hay datos suficientes, cae en `VENTANAS_ESTACIONALES` según
             la categoría (respaldo heurístico).

        Args:
            categoria: p.ej. "juguetes", "electronica", "coleccionables".
            fecha_lanzamiento: Fecha de salida del producto.
            historico_precios: Serie [(fecha, precio)] estilo Keepa.

        Returns:
            dict con la recomendación, la ventana detectada y el uplift estimado.
        """
        categoria = categoria.lower().strip()
        serie = sorted(historico_precios, key=lambda x: x[0])
        anios = {f.year for f, _ in serie}

        patron = self._detectar_pico_recurrente(serie) if len(anios) >= 2 else None

        if patron is not None:
            mes_pico, uplift_pct = patron
            nombre_mes = _NOMBRE_MES[mes_pico]
            return {
                "tipo": "fisico",
                "categoria": categoria,
                "fuente_patron": "datos_historicos",
                "recomendacion": Recomendacion.GUARDAR_HASTA_TEMPORADA.value,
                "ventana": nombre_mes,
                "uplift_estimado_pct": uplift_pct,
                "alerta": (
                    f"Patrón detectado en datos: el precio sube de media un "
                    f"{uplift_pct}% en {nombre_mes}. Guárdalo hasta entonces."
                ),
            }

        # Respaldo por categoría.
        ventana = VENTANAS_ESTACIONALES.get(categoria)
        if ventana is not None:
            (m1, d1), (m2, d2), etiqueta = ventana
            return {
                "tipo": "fisico",
                "categoria": categoria,
                "fuente_patron": "heuristica_categoria",
                "recomendacion": Recomendacion.GUARDAR_HASTA_TEMPORADA.value,
                "ventana": f"{d1:02d}/{m1:02d} – {d2:02d}/{m2:02d}",
                "uplift_estimado_pct": None,
                "alerta": (
                    f"Sin histórico multi-anual, pero '{categoria}' suele subir en "
                    f"{etiqueta} (del {d1:02d}/{m1:02d} al {d2:02d}/{m2:02d}). "
                    "Guárdalo hasta esa ventana."
                ),
            }

        return {
            "tipo": "fisico",
            "categoria": categoria,
            "fuente_patron": "ninguna",
            "recomendacion": Recomendacion.VENDER_YA.value,
            "ventana": None,
            "uplift_estimado_pct": None,
            "alerta": (
                "No hay patrón estacional claro ni histórico suficiente. "
                "Vende cuanto antes para no inmovilizar capital."
            ),
        }

    @staticmethod
    def _detectar_pico_recurrente(
        serie: Sequence[Tuple[date, float]],
    ) -> Optional[Tuple[int, float]]:
        """Busca el mes con precio medio más alto y valida que se repite entre años.

        Returns:
            (mes_pico, uplift_pct) si el mismo mes es el más caro en la mayoría
            de los años observados; en caso contrario, None.
        """
        if not serie:
            return None

        # Media de precio por (año, mes) y media global.
        por_anio_mes: Dict[Tuple[int, int], List[float]] = {}
        for f, precio in serie:
            por_anio_mes.setdefault((f.year, f.month), []).append(precio)

        media_por_anio_mes = {k: statistics.mean(v) for k, v in por_anio_mes.items()}
        media_global = statistics.mean([p for _, p in serie])
        if media_global <= 0:
            return None

        # Mes más caro dentro de cada año.
        anios = sorted({a for a, _ in media_por_anio_mes})
        mes_pico_por_anio: Dict[int, int] = {}
        for a in anios:
            meses_del_anio = {m: media_por_anio_mes[(a, m)]
                              for (aa, m) in media_por_anio_mes if aa == a}
            mes_pico_por_anio[a] = max(meses_del_anio, key=meses_del_anio.get)

        # ¿Coincide el mes pico en la mayoría de años? -> patrón recurrente.
        conteo: Dict[int, int] = {}
        for mes in mes_pico_por_anio.values():
            conteo[mes] = conteo.get(mes, 0) + 1
        mes_mas_repetido = max(conteo, key=conteo.get)
        if conteo[mes_mas_repetido] < 2:
            return None  # no se repite en al menos 2 años

        # Uplift medio de ese mes frente a la media global.
        precios_mes = [
            media_por_anio_mes[(a, mes_mas_repetido)]
            for a in anios
            if (a, mes_mas_repetido) in media_por_anio_mes
        ]
        uplift_pct = round((statistics.mean(precios_mes) - media_global) / media_global * 100, 1)
        if uplift_pct <= 0:
            return None
        return mes_mas_repetido, uplift_pct

    # ------------------------------------------------------ C) Rotura de stock
    def alerta_rotura_stock(
        self,
        tienda: str,
        historico_stock: Sequence[Tuple[datetime, int]],
    ) -> Dict[str, object]:
        """Detecta una rotura de stock (>0 → 0) en una tienda grande.

        Cuando una tienda oficial (Amazon, tienda oficial...) se queda a 0, la
        demanda se desvía a la reventa: buen momento para publicar.

        Args:
            tienda: Nombre de la tienda ("Amazon", "Tienda oficial"...).
            historico_stock: Serie [(timestamp, stock)] ordenable por fecha.

        Returns:
            dict indicando si hubo rotura, cuándo, y la recomendación.
        """
        serie = sorted(historico_stock, key=lambda x: x[0])
        rotura_en: Optional[datetime] = None
        for (_, stock_prev), (ts, stock_now) in zip(serie, serie[1:]):
            if stock_prev > 0 and stock_now == 0:
                rotura_en = ts  # nos quedamos con la más reciente

        if rotura_en is not None:
            return {
                "tipo": "rotura_stock",
                "tienda": tienda,
                "rotura_detectada": True,
                "fecha_rotura": rotura_en.isoformat(),
                "recomendacion": Recomendacion.VENDER_YA.value,
                "alerta": (
                    f"Rotura de stock detectada en {tienda} el "
                    f"{rotura_en.strftime('%d/%m/%Y %H:%M')} → la demanda se irá a "
                    "reventa, es buen momento para publicar."
                ),
            }

        stock_actual = serie[-1][1] if serie else None
        return {
            "tipo": "rotura_stock",
            "tienda": tienda,
            "rotura_detectada": False,
            "fecha_rotura": None,
            "stock_actual": stock_actual,
            "recomendacion": Recomendacion.VIGILAR.value,
            "alerta": (
                f"{tienda} sigue con stock ({stock_actual} uds). Sin rotura por "
                "ahora: mantén vigilancia."
            ),
        }


_NOMBRE_MES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril", 5: "mayo", 6: "junio",
    7: "julio", 8: "agosto", 9: "septiembre", 10: "octubre", 11: "noviembre",
    12: "diciembre",
}


# =============================================================================
# MÓDULO 3 — Orquestador
# =============================================================================


def analizar_oportunidad(producto: Dict[str, object]) -> Dict[str, object]:
    """Combina viabilidad (ROI) y timing en un único informe.

    Estructura esperada de `producto`:
        {
          "nombre": str,
          "precio_compra": float,
          "historico_ventas": List[float],
          "plataforma": str,
          "timing": {
              "tipo": "evento" | "fisico" | "rotura_stock",
              # según el tipo, los campos que pide el método correspondiente
              # de TimingEngine.
          }
        }

    La decisión final antepone la viabilidad: si no es rentable, no importa el
    timing (no compres). Si es rentable/ajustado, se adjunta la señal de cuándo
    vender.

    Returns:
        dict con `viabilidad`, `timing`, `rentable` (bool) y `resumen`.
    """
    # --- 1) Viabilidad ---
    calc = ViabilityCalculator(
        precio_compra=float(producto["precio_compra"]),
        historico_ventas=list(producto["historico_ventas"]),  # type: ignore[arg-type]
        plataforma=str(producto["plataforma"]),
    )
    viabilidad = calc.calcular()

    # --- 2) Timing ---
    engine = TimingEngine()
    timing_cfg = dict(producto.get("timing", {}))  # type: ignore[arg-type]
    tipo = timing_cfg.get("tipo")

    if tipo == "evento":
        timing = engine.analizar_entradas_evento(
            fecha_evento=timing_cfg["fecha_evento"],
            sold_out=bool(timing_cfg.get("sold_out", False)),
            evolucion_stock=timing_cfg.get("evolucion_stock", []),
        )
    elif tipo == "fisico":
        timing = engine.analizar_producto_fisico(
            categoria=str(timing_cfg["categoria"]),
            fecha_lanzamiento=timing_cfg["fecha_lanzamiento"],
            historico_precios=timing_cfg.get("historico_precios", []),
        )
    elif tipo == "rotura_stock":
        timing = engine.alerta_rotura_stock(
            tienda=str(timing_cfg["tienda"]),
            historico_stock=timing_cfg.get("historico_stock", []),
        )
    else:
        timing = {
            "tipo": "desconocido",
            "recomendacion": Recomendacion.SIN_SENAL.value,
            "alerta": "Sin datos de timing: no se puede recomendar cuándo vender.",
        }

    # --- 3) Decisión combinada ---
    rentable = viabilidad["veredicto"] != Veredicto.NO_RENTABLE.value
    if not rentable:
        resumen = (
            f"❌ NO COMPRAR: ROI {viabilidad['roi_pct']}% "
            f"(beneficio {viabilidad['beneficio_neto']}€). "
            "No compensa aunque el timing acompañe."
        )
    else:
        resumen = (
            f"✅ {viabilidad['veredicto']}: ganarías ~{viabilidad['beneficio_neto']}€ "
            f"(ROI {viabilidad['roi_pct']}%). Timing → {timing['recomendacion']}: "
            f"{timing['alerta']}"
        )

    return {
        "nombre": producto.get("nombre", "sin nombre"),
        "rentable": rentable,
        "viabilidad": viabilidad,
        "timing": timing,
        "resumen": resumen,
    }


# =============================================================================
# Ejemplos de uso con datos de prueba
# =============================================================================


def _demo_modulo_1() -> None:
    print("=" * 70)
    print("MÓDULO 1 — ViabilityCalculator")
    print("=" * 70)

    calc = ViabilityCalculator(
        precio_compra=50.0,
        historico_ventas=[88, 90, 92, 150, 89],  # 150 es un outlier
        plataforma="ebay",
    )
    resultado = calc.calcular()
    for k, v in resultado.items():
        print(f"  {k:>22}: {v}")
    print("  (La mediana ignora el outlier de 150 € → precio_venta_estimado 90 €)\n")


def _demo_modulo_2() -> None:
    hoy = date(2026, 7, 12)
    engine = TimingEngine(hoy=hoy)

    print("=" * 70)
    print("MÓDULO 2 — TimingEngine")
    print("=" * 70)

    # A) Entradas de evento: sold out, faltan 2 días, stock casi agotado.
    print("A) Entradas de evento (sold out, faltan 2 días):")
    r = engine.analizar_entradas_evento(
        fecha_evento=hoy + timedelta(days=2),
        sold_out=True,
        evolucion_stock=[
            (hoy - timedelta(days=30), 500),
            (hoy - timedelta(days=15), 300),
            (hoy - timedelta(days=2), 40),
        ],
    )
    print(f"   → {r['recomendacion']}: {r['alerta']}\n")

    # B) Producto físico con histórico de 3 años y pico navideño.
    print("B) Producto físico (juguete, pico navideño en el histórico):")
    historico: List[Tuple[date, float]] = []
    for anio in (2023, 2024, 2025):
        for mes in range(1, 13):
            precio = 40.0 + (25.0 if mes in (11, 12) else 0.0)
            historico.append((date(anio, mes, 15), precio))
    r = engine.analizar_producto_fisico(
        categoria="juguetes",
        fecha_lanzamiento=date(2023, 1, 1),
        historico_precios=historico,
    )
    print(f"   → {r['recomendacion']} ({r['ventana']}): {r['alerta']}\n")

    # C) Rotura de stock en Amazon.
    print("C) Rotura de stock (Amazon pasa de 12 a 0):")
    r = engine.alerta_rotura_stock(
        tienda="Amazon",
        historico_stock=[
            (datetime(2026, 7, 8, 10, 0), 12),
            (datetime(2026, 7, 10, 10, 0), 3),
            (datetime(2026, 7, 11, 10, 0), 0),
        ],
    )
    print(f"   → {r['recomendacion']}: {r['alerta']}\n")


def _demo_modulo_3() -> None:
    print("=" * 70)
    print("MÓDULO 3 — analizar_oportunidad (informe combinado)")
    print("=" * 70)

    hoy = date.today()
    producto = {
        "nombre": "Entrada concierto (pista)",
        "precio_compra": 60.0,
        "historico_ventas": [120, 130, 125, 128, 400],  # outlier 400
        "plataforma": "stubhub",
        "timing": {
            "tipo": "evento",
            "fecha_evento": hoy + timedelta(days=2),
            "sold_out": True,
            "evolucion_stock": [
                (hoy - timedelta(days=20), 800),
                (hoy - timedelta(days=5), 200),
                (hoy - timedelta(days=1), 50),
            ],
        },
    }
    informe = analizar_oportunidad(producto)
    print(f"  Producto: {informe['nombre']}")
    print(f"  Rentable: {informe['rentable']}")
    print(f"  {informe['resumen']}\n")


if __name__ == "__main__":
    _demo_modulo_1()
    _demo_modulo_2()
    _demo_modulo_3()
