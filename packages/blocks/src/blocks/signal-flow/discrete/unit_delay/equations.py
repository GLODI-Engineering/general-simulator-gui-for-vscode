"""Equations for signal-flow.discrete.unit_delay — one-sample delay (z⁻¹).

state_size = 1  (holds the previous sample)
is_discrete = True
The state is updated at each sample_time step; output = previous state.
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = False  # output = previous state, not current input
    is_discrete: bool = True
    sample_time_param: str = "sample_time"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["x"]

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        # Next state = current input (captured at sample instant).
        return {"x": inputs.get("in", 0.0)}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        # Output = previously stored state (one sample delayed).
        return {"out": state.get("x", float(params.get("ic", 0.0)))}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), self.rhs(state, inputs, params, t)
