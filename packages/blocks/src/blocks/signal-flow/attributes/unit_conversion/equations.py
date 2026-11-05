"""unit_conversion block equations (BE-44).

Multiplies the input signal by a pre-resolved numeric scale factor.

The ``scale`` parameter is injected into the block's params dict by the IR-1
build step (see ``ir1_builder._validate_signal_attribute_blocks``) after
calling ``unit_table.resolve_scale(from_unit, to_unit)``.  If the units are
unknown ``UnknownUnitError`` is raised at IR-1 build time, not here.

At runtime: output = input * scale.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Equations for signal-flow.attributes.unit_conversion."""

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        scale = float(params.get("scale", 1.0))
        return {"out": inputs.get("in", 0.0) * scale}, {}
