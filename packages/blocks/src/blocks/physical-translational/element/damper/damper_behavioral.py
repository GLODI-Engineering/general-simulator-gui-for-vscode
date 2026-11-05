"""Behavioral translational damper — physical-translational.element.damper (tier: behavioral).

Nonlinear viscous + quadratic drag: F = b*v + c*v*|v|
Smooth: polynomial in v — C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral damper: F = b·v + c·v·|v|."""

    domain: str = "physical-translational"
    tier: str = "behavioral"

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
        c = float(params.get("c", 0.0))
        F = state.get("F", 0.0)
        v = state.get("v", 0.0)
        return [F - b * v - c * v * abs(v)]
