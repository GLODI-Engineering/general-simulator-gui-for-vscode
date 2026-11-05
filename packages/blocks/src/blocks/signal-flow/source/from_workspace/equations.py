"""Equations for signal-flow.source.from_workspace — workspace signal source.

state_size = 0  (no state)
In headless simulation without a workspace data array, outputs 0.
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
        # Workspace data is not available in the ODE path; emit 0.
        return {"out": 0.0}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
