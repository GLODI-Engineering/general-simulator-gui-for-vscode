"""ic-on-wire block equations (BE-44).

At t == t_start the block outputs params.value (the declared initial
condition).  For all subsequent time steps it passes the upstream input
through unchanged.

``t_start`` is injected into params by the compiler (default 0.0).
``value`` is the user-declared initial value (default 0.0).
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Equations for signal-flow.attributes.ic."""

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        t_start = float(params.get("t_start", 0.0))
        value = float(params.get("value", 0.0))
        out = value if t == t_start else inputs.get("in", 0.0)
        return {"out": out}, {}
