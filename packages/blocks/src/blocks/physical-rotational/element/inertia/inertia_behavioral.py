"""Behavioral rotational inertia — physical-rotational.element.inertia (tier: behavioral).

Adds rotational aerodynamic drag: τ_net - J*dω_dt - C_drag*ω*|ω| = 0
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral rotational inertia with aerodynamic drag."""

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
        J = float(params.get("inertia", params.get("J", 1.0)))
        C_drag = float(params.get("C_drag", 0.0))
        tau_net = state.get("tau_net", 0.0)
        omega = state.get("omega", 0.0)
        domega_dt = state.get("domega_dt", 0.0)
        return [tau_net - J * domega_dt - C_drag * omega * abs(omega)]
