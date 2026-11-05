"""Converter: physical-electrical → physical-translational (BL coupling, spec §15.6).

Voice-coil / Lorentz-force coupling residuals:
  F - bl * i   = 0            (Lorentz force)
  v_emf - bl * v = 0          (back-EMF)

where:
  i     — current             (electrical through variable)
  v_emf — back-EMF voltage    (electrical across variable)
  F     — force               (translational through variable)
  v     — velocity            (translational across variable)
  bl    — force factor (N/A = V·s/m)
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Electrical-to-translational (BL coupling) converter equations."""

    in_kind: str = "physical-electrical"
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
        """Return BL coupling residuals for electrical↔translational boundary."""
        bl = float(params.get("bl", 1.0))
        i = state.get("i", 0.0)
        v_emf = state.get("v_emf", 0.0)
        force = state.get("F", 0.0)
        v = state.get("v", 0.0)
        return [
            force - bl * i,  # Lorentz force
            v_emf - bl * v,  # back-EMF
        ]
