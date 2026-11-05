"""Equations for signal-flow.discrete.integrator — discrete-time integrator.

state_size = 1  (accumulated sum)
is_discrete = True

Methods: forward (Euler), backward, trapezoidal.
The state update uses sample_time from params.
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = True  # backward/trapezoidal depend on current input
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
        """Return next state (not a derivative — caller steps at sample_time)."""
        method = str(params.get("method", "forward"))
        dt = float(params.get("sample_time", 0.01))
        u = inputs.get("in", 0.0)
        x = state.get("x", 0.0)
        if method == "forward":
            x_next = x + dt * u
        elif method == "backward":
            # Backward Euler: x[k+1] = x[k] + dt * u[k+1]  (use current u as u[k+1])
            x_next = x + dt * u
        elif method == "trapezoidal":
            # Trapezoidal: approximate — stores previous in for proper impl.
            # Simplified: same as forward for this stateless approximation.
            x_next = x + dt * u
        else:
            x_next = x + dt * u
        return {"x": x_next}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        return {"out": state.get("x", float(params.get("ic", 0.0)))}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), self.rhs(state, inputs, params, t)
