"""Ideal inductor — physical-electrical.passive.inductor (tier: ideal).

Constitutive equation:
    v_pn = L * di/dt    →    v_pn - L * di_dt = 0

Smooth: linear — trivially C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal inductor: V = L · dI/dt."""

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
        """Residual: v_pn - L * di_dt = 0."""
        L = float(params.get("L", 1.0e-6))
        v_pn = state.get("v_pn", 0.0)
        di_dt = state.get("di_dt", 0.0)
        return [v_pn - L * di_dt]
