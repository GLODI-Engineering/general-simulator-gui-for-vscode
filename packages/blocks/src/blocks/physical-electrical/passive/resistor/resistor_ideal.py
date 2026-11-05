"""Ideal resistor — physical-electrical.passive.resistor (tier: ideal).

Constitutive equation (acausal branch):
    v_pn - R * i = 0     →    i = v_pn / R

Smooth: linear in both v_pn and i — trivially C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal resistor: V = R * I."""

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
        """Return [v_pn - R * i]; zero when V = R * I."""
        R = float(params.get("R", 1000.0))
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        return [v_pn - R * i]
