"""Behavioral gyrator — physical-electrical.passive.gyrator (tier: behavioral).

Adds parasitic parallel conductance G_p (leakage) per port.
Smooth: linear — C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral gyrator with parasitic port conductances."""

    domain: str = "physical-electrical"
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
        g = float(params.get("g", 1.0))
        G_p = float(params.get("G_p", 0.0))
        v1 = state.get("v1", 0.0)
        v2 = state.get("v2", 0.0)
        i1 = state.get("i1", 0.0)
        i2 = state.get("i2", 0.0)
        return [
            i1 - g * v2 - G_p * v1,
            i2 + g * v1 - G_p * v2,
        ]
