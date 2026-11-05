"""Ideal comparator — physical-electrical.opamp.comparator (tier: ideal).

Smooth tanh approximation:
    v_out = (v_oh - v_ol)/2 * tanh(sharpness * (v_p - v_n)) + (v_oh + v_ol)/2
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Ideal comparator: smooth tanh output."""

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
        v_oh = float(params.get("v_oh", 5.0))
        v_ol = float(params.get("v_ol", 0.0))
        sharpness = float(params.get("sharpness", 1000.0))
        v_p = state.get("v_p", 0.0)
        v_n = state.get("v_n", 0.0)
        v_out = state.get("v_out", 0.0)
        v_swing = (v_oh - v_ol) * 0.5
        v_mid = (v_oh + v_ol) * 0.5
        v_ideal = v_swing * math.tanh(sharpness * (v_p - v_n)) + v_mid
        return [v_out - v_ideal]
