"""Behavioral comparator — physical-electrical.opamp.comparator (tier: behavioral).

Adds hysteresis via a shifted threshold using tanh blend.
Smooth: no hard switching.
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Behavioral comparator with smooth hysteresis."""

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
        v_oh = float(params.get("v_oh", 5.0))
        v_ol = float(params.get("v_ol", 0.0))
        v_hys = float(params.get("v_hys", 0.1))
        sharpness = float(params.get("sharpness", 1000.0))
        v_p = state.get("v_p", 0.0)
        v_n = state.get("v_n", 0.0)
        v_out = state.get("v_out", 0.0)
        # Use v_out-dependent threshold shift for hysteresis
        v_swing = (v_oh - v_ol) * 0.5
        v_mid = (v_oh + v_ol) * 0.5
        s_prev = (v_out - v_mid) / max(v_swing, 1e-9)
        offset = v_hys * s_prev * 0.5
        v_ideal = v_swing * math.tanh(sharpness * (v_p - v_n - offset)) + v_mid
        return [v_out - v_ideal]
