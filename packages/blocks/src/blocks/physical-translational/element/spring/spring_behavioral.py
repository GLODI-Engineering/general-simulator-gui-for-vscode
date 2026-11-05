"""Behavioral translational spring — physical-translational.element.spring (tier: behavioral).

Nonlinear (Duffing) spring: F = k1*x + k3*x^3
Smooth: polynomial — C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral spring: F = k1·x + k3·x³ (Duffing)."""

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
        k1 = float(params.get("stiffness", params.get("k1", 1.0)))
        k3 = float(params.get("k3", 0.0))
        F = state.get("F", 0.0)
        x = state.get("x", 0.0)
        return [F - k1 * x - k3 * x**3]
