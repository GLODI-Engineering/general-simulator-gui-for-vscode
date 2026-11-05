"""ManualSwitch block equations: output = inputs[params.current]."""

from __future__ import annotations

from typing import Any


class Equations:
    """Select one of N inputs by index stored in params.current."""

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        current: int = int(params.get("current", 0))
        return {"out": inputs.get(f"in{current}", inputs.get("in0"))}
