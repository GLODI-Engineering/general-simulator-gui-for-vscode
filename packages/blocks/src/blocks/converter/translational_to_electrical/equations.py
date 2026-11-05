"""Converter: physical-translational → physical-electrical (BL coupling, spec §15.6).

Symmetric with electrical_to_translational.  Coupling residuals:
  F - bl * i   = 0            (Lorentz force)
  v_emf - bl * v = 0          (generated voltage)

where:
  F     — force               (translational through variable)
  v     — velocity            (translational across variable)
  i     — current             (electrical through variable)
  v_emf — generated voltage   (electrical across variable)
  bl    — force factor (N/A = V·s/m)
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Translational-to-electrical (BL coupling) converter equations."""

    in_kind: str = "physical-translational"
    out_kind: str = "physical-electrical"

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
        """Return BL coupling residuals for translational↔electrical boundary."""
        bl = float(params.get("bl", 1.0))
        i = state.get("i", 0.0)
        v_emf = state.get("v_emf", 0.0)
        force = state.get("F", 0.0)
        v = state.get("v", 0.0)
        return [
            force - bl * i,  # Lorentz force
            v_emf - bl * v,  # generated voltage
        ]
