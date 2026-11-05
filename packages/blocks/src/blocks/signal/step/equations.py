"""Step source block equations."""

from __future__ import annotations

from typing import Any


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
        t_step = float(params.get("t_step", 1.0))
        # Support both legacy before/after params and the canonical amplitude param.
        if "amplitude" in params:
            before = 0.0
            after = float(params["amplitude"])
        else:
            before = float(params.get("before", 0.0))
            after = float(params.get("after", 1.0))
        value = after if t >= t_step else before
        return {"out": value}, {}
