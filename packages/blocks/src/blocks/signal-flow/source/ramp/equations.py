"""Equations for signal-flow.source.ramp — ramp signal source.

state_size = 0  (no state)
output = slope * max(0, t - t_start) + x0
"""

from __future__ import annotations

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
        slope = float(params.get("slope", 1.0))
        t_start = float(params.get("t_start", 0.0))
        x0 = float(params.get("x0", 0.0))
        dt = max(0.0, t - t_start)
        return {"out": slope * dt + x0}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
