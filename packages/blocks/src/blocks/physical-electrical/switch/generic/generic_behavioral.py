"""Behavioral generic switch — physical-electrical.switch.generic (tier: behavioral)."""

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
    """Behavioral generic switch."""

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
        r_on = float(params.get("r_on", 0.001))
        r_off = float(params.get("r_off", 1.0e6))
        threshold = float(params.get("threshold", 0.5))
        sharpness = float(params.get("sharpness", 100.0))
        ctl = state.get("ctl", 0.0)
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        s = _sigmoid(sharpness * (ctl - threshold))
        g = s / r_on + (1.0 - s) / r_off
        return [i - g * v_pn]
