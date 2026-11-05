"""Thermal temperature source equations (BE-38).

Constitutive law: T_a - T_b = T_const  (ideal temperature source — pins across)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-thermal.source.temperature"
DOMAIN = "physical-thermal"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Across source: drives constant temperature; through (heat flow) is a reaction."""
    return 0.0


class Equations:
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
