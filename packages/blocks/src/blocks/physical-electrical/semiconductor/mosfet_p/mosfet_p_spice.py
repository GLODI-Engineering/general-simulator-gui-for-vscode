"""SPICE PMOS MOSFET — physical-electrical.semiconductor.mosfet_p (tier: spice)."""

from __future__ import annotations

from typing import Any


class Equations:
    """SPICE PMOS shim."""

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
        _model: str = str(params.get("model", "PMOS"))
        _W: float = float(params.get("W", 1.0e-6))
        _L: float = float(params.get("L", 1.8e-7))
        return []
