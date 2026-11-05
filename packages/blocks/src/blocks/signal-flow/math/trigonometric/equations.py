"""Equations for signal-flow.math.trigonometric — configurable trig function.

state_size = 0  (no state, direct feedthrough)
params.operator: one of sin, cos, tan, atan2
For atan2, in0=y and in1=x.
"""

from __future__ import annotations

import math
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
        operator = str(params.get("operator", "sin"))
        if operator == "atan2":
            y = inputs.get("in0", 0.0)
            x = inputs.get("in1", 1.0)
            result = math.atan2(y, x)
        else:
            u = inputs.get("in", 0.0)
            if operator == "sin":
                result = math.sin(u)
            elif operator == "cos":
                result = math.cos(u)
            elif operator == "tan":
                result = math.tan(u)
            else:
                result = u
        return {"out": result}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
