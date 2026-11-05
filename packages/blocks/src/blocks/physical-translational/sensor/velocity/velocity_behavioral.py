"""Behavioral translational velocity sensor — physical-translational.sensor.velocity (tier: behavioral)."""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral velocity sensor with finite loading mass."""

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
        m_s = float(params.get("m_sensor", 0.0))
        F = state.get("F", 0.0)
        dv_dt = state.get("dv_dt", 0.0)
        return [F - m_s * dv_dt]
