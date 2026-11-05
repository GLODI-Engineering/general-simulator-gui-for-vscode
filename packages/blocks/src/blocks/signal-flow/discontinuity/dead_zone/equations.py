"""Equations for signal-flow.discontinuity.dead_zone.

state_size = 0  (no state, direct feedthrough)
Dead zone: output is 0 for inputs in [lo, hi], otherwise input shifted.
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = True
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
        lo = float(params.get("lo", -0.1))
        hi = float(params.get("hi", 0.1))
        u = inputs.get("in", 0.0)
        if u > hi:
            result = u - hi
        elif u < lo:
            result = u - lo
        else:
            result = 0.0
        return {"out": result}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
