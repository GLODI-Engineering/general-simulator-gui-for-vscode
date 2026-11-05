"""Ideal NMOS MOSFET — physical-electrical.semiconductor.mosfet_n (tier: ideal).

Smooth quadratic model using tanh to blend regions:
    I_D = (K/2)*(V_GS - V_th)^2 * tanh(lambda * V_DS)   (always on if V_GS > V_th)

Smooth implementation using soft-max for (V_GS - V_th):
    V_eff = smooth_max(V_GS - V_th, 0)
    I_D   = (K/2) * V_eff^2 * tanh(V_DS / V_dsat)
"""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-3) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Ideal NMOS: smooth quadratic I_D model."""

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
        K = float(params.get("K", 1.0e-3))  # process transconductance
        V_th = float(params.get("V_th", 0.7))  # threshold voltage
        V_dsat = float(params.get("V_dsat", 0.1))
        V_GS = state.get("V_GS", 0.0)
        V_DS = state.get("V_DS", 0.0)
        i_d = state.get("i_d", 0.0)
        V_eff = _smooth_max(V_GS - V_th)
        I_D = 0.5 * K * V_eff**2 * math.tanh(V_DS / max(V_dsat, 1e-9))
        return [i_d - I_D]
