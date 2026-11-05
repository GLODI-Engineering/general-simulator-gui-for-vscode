"""Ideal translational world reference — physical-translational.reference.world (tier: ideal).

Constrains velocity to zero: v = 0.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal translational world: v = 0."""

    domain: str = "physical-translational"
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
        v = state.get("v", 0.0)
        return [v]
