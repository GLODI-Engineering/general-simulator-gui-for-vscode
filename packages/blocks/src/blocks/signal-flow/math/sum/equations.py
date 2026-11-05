"""Equations for signal-flow.math.sum — weighted sum of inputs.

state_size = 0  (no state, direct feedthrough)
params.signs: string of '+'/'-' characters, one per input port.
Input ports are named in0, in1, in2, …
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
        signs: str = str(params.get("signs", "++"))
        total = 0.0
        for i, sign in enumerate(signs):
            val = inputs.get(f"in{i}", 0.0)
            total += val if sign == "+" else -val
        return {"out": total}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
