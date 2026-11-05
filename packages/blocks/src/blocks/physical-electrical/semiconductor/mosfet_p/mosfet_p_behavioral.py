"""Behavioral PMOS MOSFET — physical-electrical.semiconductor.mosfet_p (tier: behavioral)."""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-3) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Behavioral PMOS: Level-1 with smooth tanh."""

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
        mu_p = float(params.get("mu_p", 0.015))
        Cox = float(params.get("Cox", 2.3e-3))
        W = float(params.get("W", 1.0e-6))
        L = float(params.get("L", 1.8e-7))
        V_th = float(params.get("V_th", -0.5))
        lam = float(params.get("lambda", 0.01))
        V_dsat = float(params.get("V_dsat", 0.1))
        V_SG = state.get("V_SG", 0.0)
        V_SD = state.get("V_SD", 0.0)
        i_d = state.get("i_d", 0.0)
        beta = mu_p * Cox * W / L
        V_eff = _smooth_max(V_SG + V_th)
        I_D = 0.5 * beta * V_eff**2 * (1.0 + lam * V_SD) * math.tanh(V_SD / max(V_dsat, 1.0e-9))
        return [i_d - I_D]
