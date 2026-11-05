"""Ideal translational spring — physical-translational.element.spring (tier: ideal).

Hooke's law: F = k * x  →  F - k * x = 0

Smooth: linear — C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal translational spring: F = k · x."""

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
        k = float(params.get("stiffness", params.get("k", 1.0)))
        F = state.get("F", 0.0)
        x = state.get("x", 0.0)
        return [F - k * x]
