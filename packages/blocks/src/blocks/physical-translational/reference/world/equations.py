"""Translational world reference equations (BE-38).

The world reference pins the velocity (across variable) at its port to zero.
It acts as an ideal mechanical ground in the physical network.
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-translational.reference.world"
DOMAIN = "physical-translational"
IS_REFERENCE = True


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Reference block: velocity is pinned to 0.  Through (force) is a reaction.

    The reaction force is indeterminate from the constitutive law alone; it is
    determined by the network equations.  Returns 0 as a placeholder.
    """
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
