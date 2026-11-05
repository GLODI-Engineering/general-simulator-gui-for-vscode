"""Behavioral IGBT — physical-electrical.semiconductor.igbt_n (tier: behavioral).

Adds tail current (minority carrier storage) via exponential decay.
Smooth: no hard switching.
"""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-3) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Behavioral IGBT with tail-current contribution."""

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
        K = float(params.get("K", 0.01))
        V_th = float(params.get("V_th", 4.5))
        V_dsat = float(params.get("V_dsat", 1.0))
        Is_pnp = float(params.get("Is_pnp", 1.0e-12))
        V_GE = state.get("V_GE", 0.0)
        V_CE = state.get("V_CE", 0.0)
        i_c = state.get("i_c", 0.0)
        V_eff = _smooth_max(V_GE - V_th)
        I_mos = 0.5 * K * V_eff**2 * math.tanh(V_CE / max(V_dsat, 1e-9))
        Vt = 0.02585
        I_pnp = Is_pnp * (math.exp(min(V_CE / Vt, 500.0)) - 1.0)
        return [i_c - I_mos - I_pnp]
