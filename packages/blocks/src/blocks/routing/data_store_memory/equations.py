"""DataStoreMemory block equations: declare a shared mutable slot."""

from __future__ import annotations

from typing import Any


class Equations:
    """Declare a named data store; no runtime output.

    params.name          — store name (string).
    params.initial_value — initial scalar or list value.
    params.dim           — dimension descriptor, e.g. [1] for scalar.
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        # DataStoreMemory has no signal output; it is a declaration only.
        return {}
