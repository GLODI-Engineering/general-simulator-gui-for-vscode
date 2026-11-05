"""Converter: physical-translational → physical-rotational (rack-pinion).

Coupling residuals (spec §15.6, inverse of rotational_to_translational):
  τ - radius * F = 0          (torque balance)
  ω * radius - v  = 0          (velocity compatibility)

where:
  F     — through variable of the translational port (force)
  v     — across variable of the translational port  (linear velocity)
  τ     — through variable of the rotational port (torque)
  ω     — across variable of the rotational port  (angular velocity)
  radius — effective radius (m); falls back to *ratio* for compatibility.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Translational-to-rotational converter equations."""

    in_kind: str = "physical-translational"
    out_kind: str = "physical-rotational"

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
        """Return coupling residuals for translational↔rotational boundary."""
        radius = float(params.get("radius", params.get("ratio", 1.0)))
        tau = state.get("tau", 0.0)
        omega = state.get("omega", 0.0)
        force = state.get("F", 0.0)
        v = state.get("v", 0.0)
        return [
            tau - radius * force,  # torque balance
            omega * radius - v,  # velocity compatibility
        ]
