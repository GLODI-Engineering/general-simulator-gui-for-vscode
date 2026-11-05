"""Equations for signal-flow.continuous.derivative — approximate derivative.

state_size = 0  (stateless first-order finite-difference approximation)

The stateless approximation returns 0.  A proper filtered derivative
(Kd*N*(u - xf), dxf/dt = N*(u-xf)) requires state; this is the
simplified no-state placeholder matching metadata state_count=0.
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
        # Stateless: cannot compute derivative without previous value.
        return {"out": 0.0}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
