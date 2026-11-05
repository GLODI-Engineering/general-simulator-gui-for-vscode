"""Behavioral diode — physical-electrical.semiconductor.diode (tier: behavioral).

Shockley diode equation:
    I = Is * (exp(V / (n * Vt)) - 1)

where Vt = k_B * T / q ≈ 0.02585 V at 300 K.

Smooth: exp is C∞. Numerical safeguard: clamp exponent to avoid overflow.
"""

from __future__ import annotations

import math
from typing import Any

# Boltzmann / elementary charge
_K_B = 1.380649e-23
_Q = 1.602176634e-19


class Equations:
    """Behavioral diode: Shockley I = Is * (exp(V / (n * Vt)) - 1)."""

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
        n = float(params.get("n", 1.0))
        T = float(params.get("T", 300.0))
        Vt = _K_B * T / _Q
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        exponent = min(v_pn / (n * Vt), 500.0)
        i_diode = Is * (math.exp(exponent) - 1.0)
        return [i - i_diode]
