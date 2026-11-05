"""SPICE resistor — physical-electrical.passive.resistor (tier: spice).

At the SPICE tier the element card is emitted directly by the netlist writer.
The equation template is a thin shim that:
  - accepts the ``model`` parameter (optional .MODEL card name),
  - accepts TC1 / TC2 (SPICE temperature coefficients),
  - returns empty residuals (the SPICE solver owns the physics).

Smoothness is governed by the SPICE engine; event detection handles any
non-smooth pieces at IR-2.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """SPICE resistor shim — residuals delegated to SPICE engine."""

    domain: str = "physical-electrical"
    tier: str = "spice"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {}, {}

    def residuals(
        self,
        state: dict[str, float],
        params: dict[str, Any],
    ) -> list[float]:
        # Residuals are owned by the SPICE engine at IR-2.
        _model: str = str(params.get("model", ""))
        _tc1: float = float(params.get("TC1", 0.0))
        _tc2: float = float(params.get("TC2", 0.0))
        return []
