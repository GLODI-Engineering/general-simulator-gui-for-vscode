"""Ideal capacitor — physical-electrical.passive.capacitor (tier: ideal).

Constitutive equation:
    i = C * d(v_pn)/dt

DAE form (residual on i, with dv_pn/dt provided by the solver):
    i - C * dv_pn_dt = 0

Smooth: linear — trivially C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal capacitor: I = C · dV/dt."""

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
        """Residual: i - C * dv_pn_dt = 0."""
        C = float(params.get("C", 1.0e-6))
        i = state.get("i", 0.0)
        dv_pn_dt = state.get("dv_pn_dt", 0.0)
        return [i - C * dv_pn_dt]
