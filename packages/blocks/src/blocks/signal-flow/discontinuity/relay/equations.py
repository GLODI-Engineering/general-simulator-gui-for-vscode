"""Equations for signal-flow.discontinuity.relay — relay with hysteresis.

state_size = 0  (simplified, no hysteresis memory — metadata state_count=0)
Simplified: on_switch/off_switch determine output without memory.
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
        on_switch = float(params.get("on_switch", 0.5))
        off_switch = float(params.get("off_switch", -0.5))
        on_out = float(params.get("on_out", 1.0))
        off_out = float(params.get("off_out", 0.0))
        u = inputs.get("in", 0.0)
        if u >= on_switch:
            result = on_out
        elif u <= off_switch:
            result = off_out
        else:
            # In the dead-band: output stays at off_out (simplified, no memory).
            result = off_out
        return {"out": result}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
