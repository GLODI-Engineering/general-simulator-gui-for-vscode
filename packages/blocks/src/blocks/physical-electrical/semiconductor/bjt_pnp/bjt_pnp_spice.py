"""SPICE PNP BJT — physical-electrical.semiconductor.bjt_pnp (tier: spice)."""

from __future__ import annotations

from typing import Any


class Equations:
    """SPICE PNP BJT shim."""

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
        _model: str = str(params.get("model", "QPNP"))
        return []
