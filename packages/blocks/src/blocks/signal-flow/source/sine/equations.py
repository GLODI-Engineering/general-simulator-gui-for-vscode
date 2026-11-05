"""Equations for signal-flow.source.sine — sine signal source.

state_size = 0  (no state)
output = amplitude * sin(2π * frequency * t + phase) + bias
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
        frequency = float(params.get("frequency", 1.0))
        phase = float(params.get("phase", 0.0))
        bias = float(params.get("bias", 0.0))
        value = amplitude * math.sin(2.0 * math.pi * frequency * t + phase) + bias
        return {"out": value}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
