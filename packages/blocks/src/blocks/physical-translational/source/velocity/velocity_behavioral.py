"""Behavioral translational velocity source — physical-translational.source.velocity (tier: behavioral)."""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral velocity source with internal damping."""

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
        R_src = float(params.get("R_src", 0.0))
        v_src = state.get("v_src", float(params.get("v", 0.0)))
        v = state.get("v", 0.0)
        F = state.get("F", 0.0)
        return [v - v_src + R_src * F]
