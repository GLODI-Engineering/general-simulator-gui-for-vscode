"""Rotational torque source equations (BE-38).

Constitutive law: T = T_const  (ideal torque source)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-rotational.source.torque"
DOMAIN = "physical-rotational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: source drives constant torque T regardless of angular velocity."""
    return float(params.get("T", 0.0))


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
