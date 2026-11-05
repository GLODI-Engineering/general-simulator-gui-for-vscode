"""Ideal position sensor — physical-translational.sensor.position (tier: ideal)."""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal position sensor: zero force, reads position."""

    domain: str = "physical-translational"
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
        F = state.get("F", 0.0)
        return [F]
