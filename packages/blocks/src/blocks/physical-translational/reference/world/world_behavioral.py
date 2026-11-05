"""Behavioral translational world reference — physical-translational.reference.world (tier: behavioral).

Adds small compliance (k_ground) to avoid singular ground.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral translational world: v ≈ 0 (soft constraint)."""

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
        k_ground = float(params.get("k_ground", 1.0e9))
        v = state.get("v", 0.0)
        F = state.get("F", 0.0)
        return [F - k_ground * v]
