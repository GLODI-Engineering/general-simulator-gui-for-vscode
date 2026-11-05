"""Ideal rotational spring — physical-rotational.element.spring (tier: ideal).

τ = k * θ  →  τ - k * θ = 0
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal rotational spring: τ = k · θ."""

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
        k = float(params.get("stiffness", params.get("k", 1.0)))
        tau = state.get("tau", 0.0)
        theta = state.get("theta", 0.0)
        return [tau - k * theta]
