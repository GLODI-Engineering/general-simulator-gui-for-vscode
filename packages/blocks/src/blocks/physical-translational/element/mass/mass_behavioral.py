"""Behavioral translational mass — physical-translational.element.mass (tier: behavioral).

Adds translational drag coefficient (C_drag) for air/fluid resistance:
    F_net - m * dv_dt - C_drag * v * |v| = 0

Smooth: quadratic in v — C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral translational mass with aerodynamic drag."""

    domain: str = "physical-translational"
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
        m = float(params.get("mass", params.get("m", 1.0)))
        C_drag = float(params.get("C_drag", 0.0))
        F_net = state.get("F_net", 0.0)
        v = state.get("v", 0.0)
        dv_dt = state.get("dv_dt", 0.0)
        return [F_net - m * dv_dt - C_drag * v * abs(v)]
