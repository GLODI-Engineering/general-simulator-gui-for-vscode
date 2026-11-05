"""Ideal rotational inertia — physical-rotational.element.inertia (tier: ideal).

Newton's law: τ = J * dω/dt  →  τ_net - J * dω_dt = 0
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal rotational inertia: τ = J · dω/dt."""

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
        J = float(params.get("inertia", params.get("J", 1.0)))
        tau_net = state.get("tau_net", 0.0)
        domega_dt = state.get("domega_dt", 0.0)
        return [tau_net - J * domega_dt]
