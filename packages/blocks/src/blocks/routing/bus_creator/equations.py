"""BusCreator block equations: emit a BusLayout from named input elements."""

from __future__ import annotations

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
    """Create a named-element bus from scalar/vector inputs.

    params.elements — ordered list of element names, e.g. ["x", "y", "z"].
    Input ports are named after the elements: inputs["x"], inputs["y"], …

    Returns {"bus": {"elements": [...], "values": {...}}} where values maps
    each element name to its (flat) list of values.
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        elements: list[str] = [str(e) for e in params.get("elements", [])]
        values: dict[str, list[Any]] = {}
        layout: list[tuple[str, list[int]]] = []
        for name in elements:
            v = _to_flat_list(inputs.get(name, []))
            values[name] = v
            layout.append((name, [len(v)]))
        return {
            "bus": {
                "elements": layout,
                "values": values,
            }
        }
