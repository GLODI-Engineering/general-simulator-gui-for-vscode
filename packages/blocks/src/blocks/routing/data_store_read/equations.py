"""DataStoreRead block equations: read from a named shared store."""

from __future__ import annotations

from typing import Any


class Equations:
    """Read the current value of a named data store.

    params.name — store name to read from.

    The actual value is injected via inputs["_store_value"] by the
    routing layer (routing_lower.py) before calling compute().
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        return {"out": inputs.get("_store_value")}
