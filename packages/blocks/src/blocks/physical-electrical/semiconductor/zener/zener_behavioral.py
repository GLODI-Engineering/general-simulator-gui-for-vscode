"""Behavioral zener diode — physical-electrical.semiconductor.zener (tier: behavioral).

Shockley forward + smooth exponential reverse breakdown:
    I_fwd = Is * (exp(V/Vt) - 1)
    I_rev = -I_bv * exp(-(V + V_z) / V_scale)  for V < -V_z  (smooth)
"""

from __future__ import annotations

import math
from typing import Any

_K_B = 1.380649e-23
_Q = 1.602176634e-19


class Equations:
    """Behavioral zener: Shockley + smooth exponential breakdown."""

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
        V_z = float(params.get("V_z", 5.1))
        I_bv = float(params.get("I_bv", 1.0e-3))
        V_scale = float(params.get("V_scale", 0.1))
        T = float(params.get("T", 300.0))
        Vt = _K_B * T / _Q
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        i_fwd = Is * (math.exp(min(v_pn / Vt, 500.0)) - 1.0)
        bv_exp = min(-(v_pn + V_z) / V_scale, 500.0)
        i_rev = -I_bv * math.exp(bv_exp)
        return [i - i_fwd - i_rev]
