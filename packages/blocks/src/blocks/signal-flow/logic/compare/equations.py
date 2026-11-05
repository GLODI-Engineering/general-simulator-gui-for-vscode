"""Equations for signal-flow.logic.compare — relational comparison.

state_size = 0  (no state, direct feedthrough)
params.operator: one of ==, !=, <, <=, >, >=
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
        operator = str(params.get("operator", ">"))
        a = inputs.get("in0", 0.0)
        b = inputs.get("in1", 0.0)
        if operator == "==":
            result = 1.0 if a == b else 0.0
        elif operator == "!=":
            result = 1.0 if a != b else 0.0
        elif operator == "<":
            result = 1.0 if a < b else 0.0
        elif operator == "<=":
            result = 1.0 if a <= b else 0.0
        elif operator == ">":
            result = 1.0 if a > b else 0.0
        elif operator == ">=":
            result = 1.0 if a >= b else 0.0
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
