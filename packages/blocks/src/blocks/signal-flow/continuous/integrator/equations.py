"""Equations for signal-flow.continuous.integrator.

state_size = 1  (x = integral of input)
rhs:    dx/dt = input
output: out   = clamp(x, lo, hi)

Supports lo/hi clamping on the output (state is unclamped internally).
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = False
    is_discrete: bool = False

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["x"]

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        return {"x": inputs.get("in", 0.0)}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        lo = float(params.get("lo", -1.0e30))
        hi = float(params.get("hi", 1.0e30))
        x = state.get("x", 0.0)
        return {"out": max(lo, min(hi, x))}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), self.rhs(state, inputs, params, t)
