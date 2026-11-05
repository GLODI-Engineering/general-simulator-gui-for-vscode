"""Behavioral rotational damper — physical-rotational.element.damper (tier: behavioral).

τ = b*ω + c*ω*|ω|
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral rotational damper: τ = b·ω + c·ω·|ω|."""

    domain: str = "physical-rotational"
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
        tau = state.get("tau", 0.0)
        omega = state.get("omega", 0.0)
        return [tau - b * omega - c * omega * abs(omega)]
