"""Equations for signal-flow.discrete.zero_order_hold — ZOH sampler.

state_size = 0  (ZOH holds the value but doesn't add an explicit ODE state;
                 the held value is tracked externally at sample instants)
is_discrete = True
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = True  # passes input through at sample instants
    is_discrete: bool = True
    sample_time_param: str = "sample_time"

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
        # At sample instants the input is passed through.
        return {"out": inputs.get("in", 0.0)}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
