"""BusSelector block equations: unpack named elements from a bus."""

from __future__ import annotations

from typing import Any


class Equations:
    """Extract one or more named elements from a bus signal.

    params.elements — list of element names to extract.
    Input: inputs["bus"] is the bus dict produced by bus_creator.
    Output ports are named after the selected elements.
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        bus = inputs.get("bus", {})
        values: dict[str, Any] = bus.get("values", {}) if isinstance(bus, dict) else {}
        elements: list[str] = [str(e) for e in params.get("elements", [])]
        result: dict[str, Any] = {}
        for name in elements:
            result[name] = values.get(name, [])
        return result
