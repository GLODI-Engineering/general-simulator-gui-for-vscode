"""Behavioral NPN BJT — physical-electrical.semiconductor.bjt_npn (tier: behavioral).

Ebers-Moll transport model (smooth):
    I_F = Is * exp(V_BE / Vt)
    I_R = Is * exp(V_BC / Vt)
    I_C = I_F - I_R / alpha_R
    I_E = -I_F / alpha_F + I_R
    I_B = -(I_C + I_E)
"""

from __future__ import annotations

import math
from typing import Any

_K_B = 1.380649e-23
_Q = 1.602176634e-19


class Equations:
    """Behavioral NPN BJT: Ebers-Moll transport model."""

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
        Is = float(params.get("Is", 1.0e-14))
        alpha_F = float(params.get("alpha_F", 0.99))
        alpha_R = float(params.get("alpha_R", 0.1))
        T = float(params.get("T", 300.0))
        Vt = _K_B * T / _Q
        V_BE = state.get("V_BE", 0.0)
        V_BC = state.get("V_BC", 0.0)
        i_c = state.get("i_c", 0.0)
        i_b = state.get("i_b", 0.0)
        i_e = state.get("i_e", 0.0)
        I_F = Is * math.exp(min(V_BE / Vt, 500.0))
        I_R = Is * math.exp(min(V_BC / Vt, 500.0))
        I_C = I_F - I_R / alpha_R
        I_E = -I_F / alpha_F + I_R
        I_B = -(I_C + I_E)
        return [
            i_c - I_C,
            i_b - I_B,
            i_e + i_b + i_c,
        ]
