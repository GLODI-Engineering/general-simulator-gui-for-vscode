"""probe block equations (BE-44).

Read-only attribute readout.  Outputs three values describing the resolved
properties of the input wire:

- ``width_out``      — ``float``: total number of scalar elements, prod(dim).
- ``dim_out``        — ``str``: JSON-encoded dimension list, e.g. ``"[2, 3]"``.
                       This is a string value for IR-1 consumers; the scipy
                       numeric pipeline uses ``width_out`` instead.
- ``complexity_out`` — ``float``: 1.0 if the signal is complex, 0.0 if real.

The ``dim`` and ``complexity`` parameters are injected by the compiler after
the dimension-propagation pass (BE-43).  Defaults: dim=[1], complexity='real'.
"""

from __future__ import annotations

import json
import math
from typing import Any


class Equations:
    """Equations for signal-flow.attributes.probe."""

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, float]]:
        raw_dim = params.get("dim", [1])
        if isinstance(raw_dim, list | tuple):
            dim: list[int] = [int(d) for d in raw_dim]
        else:
            dim = [int(raw_dim)]

        complexity: str = str(params.get("complexity", "real"))

        width_out = float(math.prod(dim)) if dim else 1.0
        dim_out: str = json.dumps(dim)  # e.g. "[2, 3]"
        complexity_out = 1.0 if complexity == "complex" else 0.0

        return {
            "width_out": width_out,
            "dim_out": dim_out,
            "complexity_out": complexity_out,
        }, {}
