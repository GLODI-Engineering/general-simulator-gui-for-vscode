"""Equations for signal-flow.math.math_function — configurable math function.

state_size = 0  (no state, direct feedthrough)
params.operator: one of exp, log, log10, pow, sqrt
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
        operator = str(params.get("operator", "exp"))
        u = inputs.get("in", 0.0)
        try:
            if operator == "exp":
                result = math.exp(u)
            elif operator == "log":
                result = math.log(abs(u)) if u != 0.0 else float("-inf")
            elif operator == "log10":
                result = math.log10(abs(u)) if u != 0.0 else float("-inf")
            elif operator == "pow":
                result = u**2.0
            elif operator == "sqrt":
                result = math.sqrt(abs(u))
            else:
                result = u
        except (ValueError, OverflowError):
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
