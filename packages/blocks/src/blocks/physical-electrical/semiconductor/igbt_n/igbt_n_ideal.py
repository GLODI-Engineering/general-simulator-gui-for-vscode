"""Ideal IGBT — physical-electrical.semiconductor.igbt_n (tier: ideal).

Smooth MOSFET-like model (IGBT ≈ MOSFET front end + PNP BJT output):
    I_C = (K/2) * smooth_max(V_GE - V_th)^2 * tanh(V_CE / V_dsat)
"""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-3) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Ideal IGBT: smooth quadratic collector-current model."""

    domain: str = "physical-electrical"
    tier: str = "ideal"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {}, {}

    def residuals(
        self,
        state: dict[str, float],
        params: dict[str, Any],
    ) -> list[float]:
        K = float(params.get("K", 0.01))
        V_th = float(params.get("V_th", 4.5))
        V_dsat = float(params.get("V_dsat", 1.0))
        V_GE = state.get("V_GE", 0.0)
        V_CE = state.get("V_CE", 0.0)
        i_c = state.get("i_c", 0.0)
        V_eff = _smooth_max(V_GE - V_th)
        I_C = 0.5 * K * V_eff**2 * math.tanh(V_CE / max(V_dsat, 1e-9))
        return [i_c - I_C]
