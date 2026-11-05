"""Ideal translational damper — physical-translational.element.damper (tier: ideal).

F = b * v  →  F - b * v = 0

Smooth: linear — C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal translational damper: F = b · v."""

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
        b = float(params.get("damping", params.get("b", 1.0)))
        F = state.get("F", 0.0)
        v = state.get("v", 0.0)
        return [F - b * v]
