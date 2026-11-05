"""Ideal transformer — physical-electrical.passive.transformer (tier: ideal).

Constitutive equations:
    v1 = n * v2          (voltage ratio)
    i2 = n * i1          (current ratio, lossless)

Residuals:
    v1 - n * v2 = 0
    i2 - n * i1 = 0

Smooth: linear — trivially C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal transformer: V1/V2 = n, I2/I1 = n."""

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
        n = float(params.get("n", 1.0))
        v1 = state.get("v1", 0.0)
        v2 = state.get("v2", 0.0)
        i1 = state.get("i1", 0.0)
        i2 = state.get("i2", 0.0)
        return [v1 - n * v2, i2 - n * i1]
