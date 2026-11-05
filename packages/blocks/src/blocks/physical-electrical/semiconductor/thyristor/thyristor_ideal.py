"""Ideal thyristor — physical-electrical.semiconductor.thyristor (tier: ideal).

Smooth model: when gate current i_g > I_g_trig, device conducts with low R_on.
Uses a smooth sigmoid to model the state transition (no hard latch).

    conductance = G_on * sigmoid(k * (i_g - I_g_trig))
    i_ak = conductance * v_ak
"""

from __future__ import annotations

import math
from typing import Any


def _sigmoid(x: float) -> float:
    x_c = max(-500.0, min(500.0, x))
    return 1.0 / (1.0 + math.exp(-x_c))


class Equations:
    """Ideal thyristor: smooth sigmoid gate-triggered conduction."""

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
        G_on = float(params.get("G_on", 100.0))  # 1/R_on
        I_g_trig = float(params.get("I_g_trig", 0.001))
        sharpness = float(params.get("sharpness", 1000.0))
        i_g = state.get("i_g", 0.0)
        v_ak = state.get("v_ak", 0.0)
        i_ak = state.get("i_ak", 0.0)
        g = G_on * _sigmoid(sharpness * (i_g - I_g_trig))
        return [i_ak - g * v_ak]
