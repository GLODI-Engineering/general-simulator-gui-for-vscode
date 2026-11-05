"""Equations for signal-flow.continuous.pid — PID controller.

state_size = 1  (integral of error, xi)

Parallel form:
  u = Kp * e + Ki * xi + Kd * N * e      (simplified; N is derivative filter coeff)
  dxi/dt = e

For the default kd=0 case this reduces to: u = Kp*e + Ki*xi.
The direct derivative term (Kd*N*e) is a feedforward approximation when
kd > 0; a proper filtered-derivative would need a 2nd state.
"""

from __future__ import annotations

from typing import Any


class Equations:
    has_direct_feedthrough: bool = True  # P and D terms are feedthrough
    is_discrete: bool = False

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["xi"]

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        e = inputs.get("in", 0.0)
        return {"xi": e}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        kp = float(params.get("kp", 1.0))
        ki = float(params.get("ki", 0.0))
        kd = float(params.get("kd", 0.0))
        n = float(params.get("n", 100.0))
        e = inputs.get("in", 0.0)
        xi = state.get("xi", 0.0)
        u = kp * e + ki * xi + kd * n * e
        return {"out": u}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return (
            self.output(state, inputs, params, t),
            self.rhs(state, inputs, params, t),
        )
