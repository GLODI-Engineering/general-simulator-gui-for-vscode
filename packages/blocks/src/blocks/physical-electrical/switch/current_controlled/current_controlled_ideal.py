"""Ideal current-controlled switch — physical-electrical.switch.current_controlled (tier: ideal)."""

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
    """Ideal I-controlled switch: smooth sigmoid conductance."""

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
        i_on = float(params.get("i_on", 0.01))
        i_off = float(params.get("i_off", 0.0))
        sharpness = float(params.get("sharpness", 1000.0))
        i_thresh = (i_on + i_off) * 0.5
        i_ctl = state.get("i_ctl", 0.0)
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        s = _sigmoid(sharpness * (i_ctl - i_thresh))
        g = s / r_on + (1.0 - s) / r_off
        return [i - g * v_pn]
