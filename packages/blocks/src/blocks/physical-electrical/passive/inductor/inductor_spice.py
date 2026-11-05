"""SPICE inductor — physical-electrical.passive.inductor (tier: spice).

SPICE-tier shim: accepts model / IC params; residuals delegated to SPICE engine.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """SPICE inductor shim."""

    domain: str = "physical-electrical"
    tier: str = "spice"

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
        _model: str = str(params.get("model", ""))
        _ic: float = float(params.get("IC", 0.0))
        return []
