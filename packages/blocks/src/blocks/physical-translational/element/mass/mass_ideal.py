"""Ideal translational mass — physical-translational.element.mass (tier: ideal).

Newton's second law:  F = m * a  →  F_net - m * dv_dt = 0

Smooth: linear — C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal translational mass: F = m · dv/dt."""

    domain: str = "physical-translational"
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
        m = float(params.get("mass", params.get("m", 1.0)))
        F_net = state.get("F_net", 0.0)
        dv_dt = state.get("dv_dt", 0.0)
        return [F_net - m * dv_dt]
