"""Behavioral resistor — physical-electrical.passive.resistor (tier: behavioral).

Temperature-dependent resistance:
    R(T) = R0 * (1 + alpha * (T - T_ref))

Constitutive equation:
    v_pn - R(T) * i = 0

Smooth: R(T) is affine in T and i; residual is bilinear → C∞.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral resistor: R(T) = R0 * (1 + alpha * (T - T_ref))."""

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
        """Residual: v_pn - R(T) * i."""
        R0 = float(params.get("R", 1000.0))
        alpha = float(params.get("alpha", 3.9e-3))  # Cu TCR ≈ 3.9e-3 /K
        T_ref = float(params.get("T_ref", 300.15))  # 27 °C in K
        T = state.get("T", T_ref)
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        R_T = R0 * (1.0 + alpha * (T - T_ref))
        return [v_pn - R_T * i]
