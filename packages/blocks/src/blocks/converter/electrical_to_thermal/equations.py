"""Converter: physical-electrical → physical-thermal (Joule heating, spec §15.6).

Coupling residual:
  q_flow - v * i = 0          (power balance: Q = P = V·I)

where:
  v       — voltage across the electrical element (electrical across variable)
  i       — current through the element           (electrical through variable)
  q_flow  — heat flow into the thermal domain     (thermal through variable)

No extra state variables are introduced.  The thermal temperature is set by
the surrounding thermal network; this block merely injects the dissipated
power as a heat-flow source.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Electrical-to-thermal (Joule heating) converter equations."""

    in_kind: str = "physical-electrical"
    out_kind: str = "physical-thermal"

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
        """Return Joule-heating coupling residual for electrical↔thermal boundary."""
        v = state.get("v", 0.0)
        i = state.get("i", 0.0)
        q_flow = state.get("q_flow", 0.0)
        return [
            q_flow - v * i,  # Q = P = V·I
        ]
