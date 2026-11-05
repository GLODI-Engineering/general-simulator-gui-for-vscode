"""Ideal diode — physical-electrical.semiconductor.diode (tier: ideal).

Ideal-tier shim: the diode element is registered in the catalogue.
Equation residuals are computed by the domain solver using the
block's connectivity; the SPICE/behavioral tiers own the physics.

Smooth: returns empty residuals → C¹ vacuously.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal diode — catalogue shim."""

    domain: str = "physical-electrical"
    tier: str = "ideal"

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
        return []
