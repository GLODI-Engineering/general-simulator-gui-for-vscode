"""Equations for signal-flow.source.pulse — pulse signal source.

state_size = 0  (no state)
Generates a square-wave pulse.
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    has_direct_feedthrough: bool = False
    is_discrete: bool = False

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        return {}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        amplitude = float(params.get("amplitude", 1.0))
        period = float(params.get("period", 1.0))
        pulse_width = float(params.get("pulse_width", 0.5))
        phase_delay = float(params.get("phase_delay", 0.0))
        if period <= 0.0:
            return {"out": 0.0}
        # Time within the current period (after phase delay).
        t_shifted = t - phase_delay
        if t_shifted < 0.0:
            return {"out": 0.0}
        t_in_period = math.fmod(t_shifted, period)
        value = amplitude if t_in_period < pulse_width else 0.0
        return {"out": value}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
