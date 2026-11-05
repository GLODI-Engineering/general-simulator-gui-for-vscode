"""Behavioral thyristor — physical-electrical.semiconductor.thyristor (tier: behavioral).

Two-transistor analog model: NPN + PNP with regenerative feedback.
All expressions use smooth exp functions — C¹ everywhere.
"""

from __future__ import annotations

import math
from typing import Any

_K_B = 1.380649e-23
_Q = 1.602176634e-19


class Equations:
    """Behavioral thyristor: two-transistor smooth model."""

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
        Is = float(params.get("Is", 1.0e-12))
        alpha1 = float(params.get("alpha1", 0.45))
        alpha2 = float(params.get("alpha2", 0.45))
        T = float(params.get("T", 300.0))
        Vt = _K_B * T / _Q
        v_ak = state.get("v_ak", 0.0)
        i_ak = state.get("i_ak", 0.0)
        i_g = state.get("i_g", 0.0)
        I_co = Is * (math.exp(min(v_ak / Vt, 500.0)) - 1.0)
        denom = max(1.0 - alpha1 - alpha2, 1e-9)
        I_AK = (I_co + alpha2 * i_g) / denom
        return [i_ak - I_AK]
