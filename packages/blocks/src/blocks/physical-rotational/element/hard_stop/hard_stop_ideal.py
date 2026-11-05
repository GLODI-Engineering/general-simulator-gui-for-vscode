"""Ideal rotational hard stop — physical-rotational.element.hard_stop (tier: ideal).

Ideal-tier shim: the hard-stop element is registered in the catalogue.
The behavioral tier owns the smooth contact-torque physics (softplus).

Smooth: returns empty residuals → C¹ vacuously.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal rotational hard stop — catalogue shim."""

    domain: str = "physical-rotational"
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
