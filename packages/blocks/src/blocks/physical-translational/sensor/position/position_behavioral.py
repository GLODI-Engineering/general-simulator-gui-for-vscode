"""Behavioral position sensor — physical-translational.sensor.position (tier: behavioral)."""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral position sensor with spring loading."""

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
        x = state.get("x", 0.0)
        F = state.get("F", 0.0)
        return [F - k_s * x]
