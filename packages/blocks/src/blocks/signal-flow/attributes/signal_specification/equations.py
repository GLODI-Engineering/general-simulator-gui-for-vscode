"""signal_specification block equations (BE-44).

Compile-time-only block.  At runtime it is a pure passthrough: output = u.
Dimension checking happens at BE-43 (dim_propagate pass), not here.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Equations for signal-flow.attributes.signal_specification."""

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {"out": inputs.get("in", 0.0)}, {}
