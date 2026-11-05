"""Equations for signal-flow.discrete.delay — multi-sample delay (z⁻ᴺ).

state_size = dynamic: length parameter determines how many samples to store.
is_discrete = True
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = False
    is_discrete: bool = True
    sample_time_param: str = "sample_time"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        length = int(params.get("length", 1))
        length = max(1, length)
        return [f"x{i}" for i in range(length)]

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        """Shift register: x0 <- input, x1 <- x0, …"""
        length = int(params.get("length", 1))
        length = max(1, length)
        names = [f"x{i}" for i in range(length)]
        result: dict[str, float] = {}
        result[names[0]] = inputs.get("in", 0.0)
        for i in range(1, length):
            result[names[i]] = state.get(names[i - 1], 0.0)
        return result

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        length = int(params.get("length", 1))
        last = f"x{max(0, length - 1)}"
        ic = float(params.get("ic", 0.0))
        return {"out": state.get(last, ic)}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), self.rhs(state, inputs, params, t)
