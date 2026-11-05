"""Ideal band-limited op-amp — physical-electrical.opamp.band_limited (tier: ideal).

Simplified: ignores GBP/SR; behaves like ideal op-amp (virtual short).
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Band-limited op-amp (ideal tier): virtual short."""

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
        v_p = state.get("v_p", 0.0)
        v_n = state.get("v_n", 0.0)
        i_p = state.get("i_p", 0.0)
        i_n = state.get("i_n", 0.0)
        return [v_p - v_n, i_p, i_n]
