"""Behavioral translational force sensor — physical-translational.sensor.force (tier: behavioral)."""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral force sensor with finite stiffness."""

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
        k_s = float(params.get("k_sensor", 1.0e9))
        v_p = state.get("v_p", 0.0)
        v_n = state.get("v_n", 0.0)
        F = state.get("F", 0.0)
        return [F - k_s * (v_p - v_n)]
