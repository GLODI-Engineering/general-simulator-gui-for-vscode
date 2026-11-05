"""Converter: physical-rotational → physical-translational (gear-rack).

Coupling residuals (spec §15.6):
  τ - radius * F = 0          (torque balance)
  ω * radius - v  = 0          (velocity compatibility)

where:
  τ     — through variable of the rotational port (torque)
  ω     — across variable of the rotational port  (angular velocity)
  F     — through variable of the translational port (force)
  v     — across variable of the translational port  (linear velocity)
  radius — gear rack effective radius (m), param name *radius*
            falls back to *ratio* for compatibility with older schematics.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Rotational-to-translational converter equations."""

    in_kind: str = "physical-rotational"
    out_kind: str = "physical-translational"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        # Not called by signal-flow ODE solver; physical ports are acausal.
        return {}, {}

    def residuals(
        self,
        state: dict[str, float],
        params: dict[str, Any],
    ) -> list[float]:
        """Return coupling residuals for rotational↔translational boundary."""
        radius = float(params.get("radius", params.get("ratio", 1.0)))
        tau = state.get("tau", 0.0)
        omega = state.get("omega", 0.0)
        force = state.get("F", 0.0)
        v = state.get("v", 0.0)
        return [
            tau - radius * force,  # torque balance
            omega * radius - v,  # velocity compatibility
        ]
