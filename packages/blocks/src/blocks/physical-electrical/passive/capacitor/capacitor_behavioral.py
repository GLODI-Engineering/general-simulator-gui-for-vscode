"""Behavioral capacitor — physical-electrical.passive.capacitor (tier: behavioral).

Voltage-dependent capacitance (e.g. varactor):
    C(v) = C0 / (1 + v_pn / V_j) ** m

    where V_j is junction built-in voltage and m is grading coefficient.

Constitutive equation:
    i - C(v_pn) * dv_pn_dt = 0

Smooth: C(v) is smooth for v_pn > -V_j (reverse-biased region).
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral capacitor: C(V) = C0 / (1 + V/V_j)^m."""

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
        """Residual: i - C(v_pn) * dv_pn_dt = 0."""
        C0 = float(params.get("C", 1.0e-6))
        V_j = float(params.get("V_j", 0.6))
        m = float(params.get("m", 0.5))
        i = state.get("i", 0.0)
        v_pn = state.get("v_pn", 0.0)
        dv_pn_dt = state.get("dv_pn_dt", 0.0)
        denom = max(1.0 + v_pn / V_j, 1e-9)
        C_v = C0 / (denom**m)
        return [i - C_v * dv_pn_dt]
