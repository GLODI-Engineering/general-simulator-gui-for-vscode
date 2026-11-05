"""Thermal absolute reference equations (BE-38).

The absolute reference pins the temperature (across variable) at its port to
a fixed value T (default 293.15 K).  It acts as an ideal thermal ground in
the physical network.
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-thermal.reference.absolute"
DOMAIN = "physical-thermal"
IS_REFERENCE = True


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Reference block: temperature is pinned to T_ref.  Through (heat flow) is a reaction."""
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
