"""Behavioral inductor — physical-electrical.passive.inductor (tier: behavioral).

Saturable inductor: inductance decreases with current magnitude.
    L(i) = L0 / (1 + (i / I_sat)**2)

Constitutive equation:
    v_pn - L(i) * di_dt = 0

Smooth: L(i) is C∞ in i.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral inductor: L(I) = L0 / (1 + (I/I_sat)²)."""

    domain: str = "physical-electrical"
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
        """Residual: v_pn - L(i) * di_dt = 0."""
        L0 = float(params.get("L", 1.0e-6))
        I_sat = float(params.get("I_sat", 1.0))
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        di_dt = state.get("di_dt", 0.0)
        L_i = L0 / (1.0 + (i / I_sat) ** 2)
        return [v_pn - L_i * di_dt]
