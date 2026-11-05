"""Equations for signal-flow.source.step — step signal source.

state_size = 0  (no state)
output(state, inputs, params, t) → {"out": value}
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = False
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
        before = float(params.get("before", 0.0))
        after = float(params.get("after", 1.0))
        t_step = float(params.get("t_step", 1.0))
        return {"out": after if t >= t_step else before}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
