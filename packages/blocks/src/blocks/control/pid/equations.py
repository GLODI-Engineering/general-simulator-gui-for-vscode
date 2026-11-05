"""PID controller block equations.

u = Kp*e + Ki*integral(e) + Kd*(e - prev_e)

State vars:
  - i:      integral of e
  - prev_e: previous error (v1 compromise for derivative term — see §6.3)

NOTE: The prev_e state is a v1 compromise. The solver's own step size acts
as dt for the derivative approximation. v2 will use an explicit filter
parameter for a proper continuous-time derivative channel.
"""

from __future__ import annotations

from typing import Any

# Guard against extreme output for anti-windup check.
SATURATION_GUARD = 1e6


class Equations:
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["i", "prev_e"]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        kp = float(params.get("kp", 1.0))
        ki = float(params.get("ki", 0.0))
        kd = float(params.get("kd", 0.0))
        anti_windup: bool = bool(params.get("anti_windup", True))

        e = inputs.get("in", 0.0)
        integral = state.get("i", 0.0)
        prev_e = state.get("prev_e", 0.0)

        u = kp * e + ki * integral + kd * (e - prev_e)

        # Anti-windup: only integrate when output is not saturated.
        di = e if (not anti_windup or abs(u) < SATURATION_GUARD) else 0.0

        return {"out": u}, {"i": di, "prev_e": e}
