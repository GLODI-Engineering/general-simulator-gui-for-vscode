"""Ideal finite-gain op-amp — physical-electrical.opamp.finite_gain (tier: ideal).

    v_out = Av * (v_p - v_n)

Linear — trivially C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Finite-gain op-amp (ideal tier): v_out = Av * (v_p - v_n)."""

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
        Av = float(params.get("Av", 1.0e5))
        v_p = state.get("v_p", 0.0)
        v_n = state.get("v_n", 0.0)
        v_out = state.get("v_out", 0.0)
        i_p = state.get("i_p", 0.0)
        i_n = state.get("i_n", 0.0)
        return [v_out - Av * (v_p - v_n), i_p, i_n]
