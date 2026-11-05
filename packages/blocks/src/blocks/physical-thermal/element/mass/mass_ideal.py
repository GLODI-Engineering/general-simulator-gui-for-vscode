"""Ideal thermal mass — physical-thermal.element.mass (tier: ideal).

Constitutive equation:  C * dT/dt = Q_net
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal thermal mass / capacitance."""

    domain: str = "physical-thermal"
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
