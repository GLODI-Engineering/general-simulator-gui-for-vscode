"""Behavioral op-amp (ideal type) — physical-electrical.opamp.ideal (tier: behavioral).

Finite saturation: output clips to ±V_sat using tanh.
    v_out = V_sat * tanh(Av * (v_p - v_n) / V_sat)
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Behavioral op-amp (ideal type): tanh saturation."""

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
        Av = float(params.get("Av", 1.0e5))
        V_sat = float(params.get("V_sat", 15.0))
        v_p = state.get("v_p", 0.0)
        v_n = state.get("v_n", 0.0)
        v_out = state.get("v_out", 0.0)
        i_p = state.get("i_p", 0.0)
        i_n = state.get("i_n", 0.0)
        v_out_ideal = V_sat * math.tanh(Av * (v_p - v_n) / V_sat)
        return [v_out - v_out_ideal, i_p, i_n]
