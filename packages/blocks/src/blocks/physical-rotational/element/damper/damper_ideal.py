"""Ideal rotational damper — physical-rotational.element.damper (tier: ideal).

τ = b * ω  →  τ - b * ω = 0
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal rotational damper: τ = b · ω."""

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
        b = float(params.get("damping", params.get("b", 1.0)))
        tau = state.get("tau", 0.0)
        omega = state.get("omega", 0.0)
        return [tau - b * omega]
