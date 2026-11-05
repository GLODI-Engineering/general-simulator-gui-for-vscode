"""Behavioral NMOS MOSFET — physical-electrical.semiconductor.mosfet_n (tier: behavioral).

Level-1 SPICE-like model with smooth region transitions via tanh:
    I_D = mu_n * Cox * (W/L) / 2 * V_eff^2 * (1 + lambda * V_DS) * tanh(V_DS/V_dsat)

All expressions are smooth (C¹).
"""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-3) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Behavioral NMOS: Level-1 model with smooth tanh region blend."""

    domain: str = "physical-electrical"
    tier: str = "behavioral"

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
        mu_n = float(params.get("mu_n", 0.045))  # m²/(V·s)
        Cox = float(params.get("Cox", 2.3e-3))  # F/m²
        W = float(params.get("W", 1.0e-6))
        L = float(params.get("L", 1.8e-7))
        V_th = float(params.get("V_th", 0.5))
        lam = float(params.get("lambda", 0.01))  # channel-length modulation
        V_dsat = float(params.get("V_dsat", 0.1))
        V_GS = state.get("V_GS", 0.0)
        V_DS = state.get("V_DS", 0.0)
        i_d = state.get("i_d", 0.0)
        beta = mu_n * Cox * W / L
        V_eff = _smooth_max(V_GS - V_th)
        I_D = 0.5 * beta * V_eff**2 * (1.0 + lam * V_DS) * math.tanh(V_DS / max(V_dsat, 1.0e-9))
        return [i_d - I_D]
