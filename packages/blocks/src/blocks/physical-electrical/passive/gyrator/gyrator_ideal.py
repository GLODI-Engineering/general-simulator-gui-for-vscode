"""Ideal gyrator — physical-electrical.passive.gyrator (tier: ideal).

Constitutive equations:
    i1 =  g * v2
    i2 = -g * v1

Residuals:
    i1 - g * v2 = 0
    i2 + g * v1 = 0

Smooth: linear — trivially C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal gyrator: I1 = g·V2, I2 = -g·V1."""

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
        g = float(params.get("g", 1.0))
        v1 = state.get("v1", 0.0)
        v2 = state.get("v2", 0.0)
        i1 = state.get("i1", 0.0)
        i2 = state.get("i2", 0.0)
        return [i1 - g * v2, i2 + g * v1]
