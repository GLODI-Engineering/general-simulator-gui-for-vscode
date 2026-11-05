"""Sum block equations.

Signs parameter is a string of '+' and '-' characters, one per input port.
Input ports are named in0, in1, in2, … matching the variadic expansion.
"""

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
        signs: str = params.get("signs", "++")
        total = 0.0
        for i, sign in enumerate(signs):
            port_id = f"in{i}"
            val = inputs.get(port_id, 0.0)
            total += val if sign == "+" else -val
        return {"out": total}, {}
