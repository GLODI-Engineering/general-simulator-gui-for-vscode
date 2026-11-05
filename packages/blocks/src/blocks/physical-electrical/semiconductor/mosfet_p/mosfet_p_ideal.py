"""Ideal PMOS MOSFET — physical-electrical.semiconductor.mosfet_p (tier: ideal).

Mirror of NMOS with negated polarities.
"""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-3) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Ideal PMOS: smooth quadratic I_D model (V_SG convention)."""

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
        K = float(params.get("K", 5.0e-4))
        V_th = float(params.get("V_th", -0.7))  # negative for PMOS
        V_dsat = float(params.get("V_dsat", 0.1))
        V_SG = state.get("V_SG", 0.0)
        V_SD = state.get("V_SD", 0.0)
        i_d = state.get("i_d", 0.0)
        V_eff = _smooth_max(V_SG + V_th)
        I_D = 0.5 * K * V_eff**2 * math.tanh(V_SD / max(V_dsat, 1e-9))
        return [i_d - I_D]
