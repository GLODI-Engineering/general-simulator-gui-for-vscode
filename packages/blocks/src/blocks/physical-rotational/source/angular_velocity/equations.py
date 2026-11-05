"""Rotational angular velocity source equations (BE-38).

Constitutive law: ω_a - ω_b = w_const  (ideal angular velocity source)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-rotational.source.angular_velocity"
DOMAIN = "physical-rotational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Across source: drives constant angular velocity; through (torque) is a reaction."""
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
