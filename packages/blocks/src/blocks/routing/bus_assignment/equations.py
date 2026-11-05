"""BusAssignment block equations: replace named elements of an input bus."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def _to_flat_list(v: Any) -> list[Any]:
    if isinstance(v, int | float):
        return [v]
    if isinstance(v, list):
        return v
    if hasattr(v, "tolist"):
        return v.tolist()  # type: ignore[no-any-return]
    return list(v)


class Equations:
    """Replace named elements of a bus; non-listed elements pass through.

    params.elements — list of element names to replace.
    inputs["bus"] — source bus dict.
    inputs[<element_name>] — new value for each listed element.
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        bus = inputs.get("bus", {})
        if not isinstance(bus, dict):
            bus = {}
        result = deepcopy(bus)
        values: dict[str, Any] = result.get("values", {})
        result["values"] = values
        elements: list[str] = [str(e) for e in params.get("elements", [])]
        for name in elements:
            if name in inputs:
                values[name] = _to_flat_list(inputs[name])
        return {"bus": result}
