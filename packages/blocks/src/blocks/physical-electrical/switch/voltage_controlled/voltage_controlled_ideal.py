"""Ideal voltage-controlled switch — physical-electrical.switch.voltage_controlled (tier: ideal).

Smooth tanh-based resistance vs control voltage:
    g(v_ctl) = G_on * sigmoid(sharpness * (v_ctl - v_thresh))
             + G_off * (1 - sigmoid(...))

where v_thresh = (v_on + v_off) / 2.  Smooth everywhere.
"""

from __future__ import annotations

import math
from typing import Any


def _sigmoid(x: float) -> float:
    if x > 500:
        return 1.0
    if x < -500:
        return 0.0
    return 1.0 / (1.0 + math.exp(-x))


class Equations:
    """Ideal V-controlled switch: smooth sigmoid conductance."""

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
        r_on = float(params.get("r_on", 0.001))
        r_off = float(params.get("r_off", 1.0e6))
        v_on = float(params.get("v_on", 1.0))
        v_off = float(params.get("v_off", 0.0))
        sharpness = float(params.get("sharpness", 100.0))
        v_thresh = (v_on + v_off) * 0.5
        v_ctl = state.get("v_ctl", 0.0)
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        s = _sigmoid(sharpness * (v_ctl - v_thresh))
        g = s / r_on + (1.0 - s) / r_off
        return [i - g * v_pn]
