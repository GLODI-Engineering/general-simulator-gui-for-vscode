"""Ideal translational force source — physical-translational.source.force (tier: ideal).

Ideal source: applies specified force regardless of velocity.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal force source."""

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
        F_src = state.get("F_src", float(params.get("F", 0.0)))
        F = state.get("F", 0.0)
        return [F - F_src]
