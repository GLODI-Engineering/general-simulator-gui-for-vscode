"""DataStoreWrite block equations: write to a named shared store."""

from __future__ import annotations

from typing import Any


class Equations:
    """Write to a named data store.

    params.name — store name to write to.
    inputs["in"] — value to write.

    The routing layer (routing_lower.py) intercepts the write and commits it
    via RoutingPlan.commit_writes() at the end of each timestep.
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        # The write itself is handled by the routing layer; no signal output.
        return {}
