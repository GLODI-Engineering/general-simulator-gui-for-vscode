"""Behavioral rotational spring — physical-rotational.element.spring (tier: behavioral).

Nonlinear: τ = k1*θ + k3*θ^3
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral rotational spring: τ = k1·θ + k3·θ³."""

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
        k1 = float(params.get("stiffness", params.get("k1", 1.0)))
        k3 = float(params.get("k3", 0.0))
        tau = state.get("tau", 0.0)
        theta = state.get("theta", 0.0)
        return [tau - k1 * theta - k3 * theta**3]
