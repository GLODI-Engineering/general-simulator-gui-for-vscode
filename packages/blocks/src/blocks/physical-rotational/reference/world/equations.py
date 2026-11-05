"""Rotational world reference equations (BE-38).

The world reference pins the angular velocity (across variable) at its port
to zero, acting as an ideal mechanical ground in the rotational domain.
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-rotational.reference.world"
DOMAIN = "physical-rotational"
IS_REFERENCE = True


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Reference block: angular velocity is pinned to 0.  Through (torque) is a reaction."""
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
