"""Routing blocks IR-1 lowering — BE-42.

``routing_lower(ir1)`` scans an ``IR1Graph`` for routing blocks, validates
them at build time, and returns a ``RoutingPlan`` that describes every routing
block's effect on the state/output vector.

Supported block types (``signal-flow.routing.*``):
    mux, demux, selector,
    bus_creator, bus_selector, bus_assignment,
    merge, manual_switch, multiport_switch, switch,
    data_store_memory, data_store_read, data_store_write.

Errors raised at IR-1 build time
---------------------------------
DimMismatchError
    demux: sum(params.outputs) ≠ input dim (when dim is known).
SelectorOutOfRangeError
    selector: an index is out of range for the input dim (when dim is known).
UnresolvedDataStoreError
    data_store_read / data_store_write references a name not declared by any
    data_store_memory block in the same graph.
"""

from __future__ import annotations

import warnings
from collections.abc import Callable
from typing import Any

from simulator.ir.ir1 import BusLayout, DataStoreSlot, IR1Graph

__all__ = [
    "DimMismatchError",
    "RoutingPlan",
    "SelectorOutOfRangeError",
    "UnresolvedDataStoreError",
    "routing_lower",
]

# ---------------------------------------------------------------------------
# Public error types
# ---------------------------------------------------------------------------


class DimMismatchError(Exception):
    """Raised when a demux partition doesn't match the input dimension."""


class SelectorOutOfRangeError(Exception):
    """Raised when a selector index exceeds the input dimension."""


class UnresolvedDataStoreError(Exception):
    """Raised when a data_store_read/write names an undeclared store."""


# ---------------------------------------------------------------------------
# RoutingPlan
# ---------------------------------------------------------------------------

# Evaluator signature: (plan, inputs) -> outputs
_EvalFn = Callable[["RoutingPlan", dict[str, Any]], dict[str, Any]]


class RoutingPlan:
    """Compiled routing plan returned by ``routing_lower``.

    Attributes
    ----------
    data_stores:
        Dict mapping store name → ``DataStoreSlot`` for every
        ``data_store_memory`` block in the graph.

    Methods
    -------
    compute(block_id, inputs):
        Evaluate a routing block and return its output dict.
    commit_writes():
        Commit all pending ``data_store_write`` values from the current
        timestep (last-write-wins).  Call once per simulation step.
    """

    def __init__(self) -> None:
        self.data_stores: dict[str, DataStoreSlot] = {}
        # Internal: block_id → evaluator callable
        self._evaluators: dict[str, _EvalFn] = {}
        # Current committed values of each data store
        self._store_values: dict[str, Any] = {}
        # Pending writes this timestep: name → list of values
        self._pending_writes: dict[str, list[Any]] = {}

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def compute(self, block_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
        """Evaluate routing block *block_id* given *inputs*, return outputs."""
        fn = self._evaluators[block_id]
        return fn(self, inputs)

    def commit_writes(self) -> None:
        """Commit pending data-store writes; call at end of each timestep.

        If multiple writes target the same store in one timestep the last
        write wins and a ``UserWarning`` is issued.
        """
        for name, values in self._pending_writes.items():
            if len(values) > 1:
                warnings.warn(
                    f"data_store '{name}': {len(values)} write(s) in one timestep;"
                    " using last-write-wins.",
                    UserWarning,
                    stacklevel=2,
                )
            self._store_values[name] = values[-1]
        self._pending_writes.clear()

    # ------------------------------------------------------------------
    # Internal helpers used by evaluators
    # ------------------------------------------------------------------

    def _read_store(self, name: str) -> Any:
        """Return the current value of *name*, or its initial value."""
        if name in self._store_values:
            return self._store_values[name]
        slot = self.data_stores[name]
        return slot.initial_value

    def _queue_write(self, name: str, value: Any) -> None:
        """Queue a write to data store *name*; committed by commit_writes()."""
        self._pending_writes.setdefault(name, []).append(value)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_flat_list(v: Any) -> list[Any]:
    """Flatten a scalar, list, or numpy array to a plain list."""
    if isinstance(v, int | float):
        return [v]
    if isinstance(v, list):
        return v
    if hasattr(v, "tolist"):
        return v.tolist()  # type: ignore[no-any-return]
    return list(v)


def _scalar(v: Any) -> float:
    if isinstance(v, int | float):
        return float(v)
    lst = _to_flat_list(v)
    return float(lst[0])


def _input_flat_dim(ir1: IR1Graph, block_id: str, port_id: str) -> int | None:
    """Return the flat (product) dimension of *port_id* on *block_id*, or None."""
    for conn in ir1.connections:
        if conn.dst == (block_id, port_id) and conn.dim is not None:
            d = conn.dim
            result = 1
            for x in d:
                result *= x
            return result
    return None


def _meets_criteria(control: float, threshold: float, criteria: str) -> bool:
    if criteria == ">=":
        return control >= threshold
    if criteria == ">":
        return control > threshold
    if criteria == "~=":
        return abs(control - threshold) < 1e-9
    return control >= threshold  # fallback


# ---------------------------------------------------------------------------
# Evaluator factories
# ---------------------------------------------------------------------------


def _make_mux_eval(params: dict[str, Any]) -> _EvalFn:
    n_inputs: int = int(params.get("n_inputs", 2))

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        result: list[Any] = []
        for i in range(n_inputs):
            result.extend(_to_flat_list(inputs.get(f"in{i}", [])))
        return {"out": result}

    return fn


def _make_demux_eval(params: dict[str, Any]) -> _EvalFn:
    outputs_spec: list[int] = [int(s) for s in params.get("outputs", [1, 1])]

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        inp = _to_flat_list(inputs.get("in", []))
        result: dict[str, Any] = {}
        offset = 0
        for i, size in enumerate(outputs_spec):
            result[f"out{i}"] = inp[offset : offset + size]
            offset += size
        return result

    return fn


def _make_selector_eval(params: dict[str, Any]) -> _EvalFn:
    indices: list[int] = [int(i) for i in params.get("indices", [])]

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        inp = _to_flat_list(inputs.get("in", []))
        return {"out": [inp[i] for i in indices]}

    return fn


def _make_bus_creator_eval(params: dict[str, Any]) -> _EvalFn:
    elements: list[str] = [str(e) for e in params.get("elements", [])]

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        values: dict[str, list[Any]] = {}
        layout: list[tuple[str, list[int]]] = []
        for name in elements:
            v = _to_flat_list(inputs.get(name, []))
            values[name] = v
            layout.append((name, [len(v)]))
        bus_layout = BusLayout(elements=layout)
        return {"bus": {"layout": bus_layout, "values": values}}

    return fn


def _make_bus_selector_eval(params: dict[str, Any]) -> _EvalFn:
    sel_elements: list[str] = [str(e) for e in params.get("elements", [])]

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        bus = inputs.get("bus", {})
        if not isinstance(bus, dict):
            bus = {}
        values: dict[str, Any] = bus.get("values", {})
        result: dict[str, Any] = {}
        for name in sel_elements:
            result[name] = values.get(name, [])
        return result

    return fn


def _make_bus_assignment_eval(params: dict[str, Any]) -> _EvalFn:
    asgn_elements: list[str] = [str(e) for e in params.get("elements", [])]

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        bus = inputs.get("bus", {})
        if not isinstance(bus, dict):
            bus = {}
        # Deep-copy the values dict so we don't mutate the input
        import copy

        values: dict[str, Any] = copy.deepcopy(bus.get("values", {}))
        layout = bus.get("layout")
        for name in asgn_elements:
            if name in inputs:
                values[name] = _to_flat_list(inputs[name])
        return {"bus": {"layout": layout, "values": values}}

    return fn


def _make_merge_eval(params: dict[str, Any]) -> _EvalFn:
    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        active: int = int(params.get("_active", 0))
        return {"out": inputs.get(f"in{active}", inputs.get("in0"))}

    return fn


def _make_manual_switch_eval(params: dict[str, Any]) -> _EvalFn:
    current: int = int(params.get("current", 0))

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        return {"out": inputs.get(f"in{current}", inputs.get("in0"))}

    return fn


def _make_multiport_switch_eval(params: dict[str, Any]) -> _EvalFn:
    n_inputs: int = int(params.get("n_inputs", 2))

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        control_raw = inputs.get("control", 0)
        idx = max(0, min(int(_scalar(control_raw)), n_inputs - 1))
        return {"out": inputs.get(f"in{idx}", inputs.get("in0"))}

    return fn


def _make_switch_eval(params: dict[str, Any]) -> _EvalFn:
    threshold: float = float(params.get("threshold", 0.0))
    criteria: str = str(params.get("criteria", ">="))

    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        # Per acceptance criterion: criteria(inputs[1], threshold)
        # "control" is inputs[1] (the second input / control port)
        control_raw = inputs.get("control", inputs.get("in1", 0.0))
        control = _scalar(control_raw)
        if _meets_criteria(control, threshold, criteria):
            return {"out": inputs.get("in1")}
        return {"out": inputs.get("in0")}

    return fn


def _make_data_store_memory_eval(name: str) -> _EvalFn:
    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        # Declaration only — no runtime output
        _ = plan
        _ = inputs
        return {}

    return fn


def _make_data_store_read_eval(name: str) -> _EvalFn:
    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        _ = inputs
        return {"out": plan._read_store(name)}

    return fn


def _make_data_store_write_eval(name: str) -> _EvalFn:
    def fn(plan: RoutingPlan, inputs: dict[str, Any]) -> dict[str, Any]:
        plan._queue_write(name, inputs.get("in"))
        return {}

    return fn


# ---------------------------------------------------------------------------
# Routing block type registry
# ---------------------------------------------------------------------------

_ROUTING_PREFIX = "signal-flow.routing."

_ROUTING_TYPES: frozenset[str] = frozenset(
    {
        "mux",
        "demux",
        "selector",
        "bus_creator",
        "bus_selector",
        "bus_assignment",
        "merge",
        "manual_switch",
        "multiport_switch",
        "switch",
        "data_store_memory",
        "data_store_read",
        "data_store_write",
    }
)


def _routing_kind(block_type: str) -> str | None:
    """Return the bare routing kind if *block_type* is a routing block, else None."""
    if block_type.startswith(_ROUTING_PREFIX):
        kind = block_type[len(_ROUTING_PREFIX) :]
        if kind in _ROUTING_TYPES:
            return kind
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def routing_lower(ir1: IR1Graph) -> RoutingPlan:
    """Lower all routing blocks in *ir1* into a ``RoutingPlan``.

    Parameters
    ----------
    ir1:
        The IR-1 graph to process.  Block types must follow the
        ``signal-flow.routing.<kind>`` naming convention.

    Returns
    -------
    RoutingPlan
        A plan that can evaluate any routing block via ``plan.compute()``.

    Raises
    ------
    DimMismatchError
        A demux block's ``params.outputs`` sum doesn't match the input dim.
    SelectorOutOfRangeError
        A selector block has an out-of-range index for its input dim.
    UnresolvedDataStoreError
        A ``data_store_read`` or ``data_store_write`` references an unknown
        store name.
    """
    plan = RoutingPlan()

    # ── Pass 1: collect data_store_memory declarations ──────────────────
    for block in ir1.blocks:
        kind = _routing_kind(block.block_type)
        if kind == "data_store_memory":
            name = str(block.params.get("name", block.instance_id))
            initial = block.params.get("initial_value", 0.0)
            dim: list[int] = [int(d) for d in block.params.get("dim", [1])]
            plan.data_stores[name] = DataStoreSlot(
                name=name,
                initial_value=initial,
                dim=dim,
            )

    # ── Pass 2: validate and build evaluators ───────────────────────────
    for block in ir1.blocks:
        kind = _routing_kind(block.block_type)
        if kind is None:
            continue

        params = block.params
        bid = block.instance_id

        if kind == "demux":
            outputs_spec: list[int] = [int(s) for s in params.get("outputs", [1, 1])]
            input_dim = _input_flat_dim(ir1, bid, "in")
            if input_dim is not None and sum(outputs_spec) != input_dim:
                raise DimMismatchError(
                    f"demux block '{bid}': outputs partition sums to "
                    f"{sum(outputs_spec)} but input dim is {input_dim}."
                )
            plan._evaluators[bid] = _make_demux_eval(params)

        elif kind == "selector":
            indices: list[int] = [int(i) for i in params.get("indices", [])]
            input_dim = _input_flat_dim(ir1, bid, "in")
            if input_dim is not None:
                for idx in indices:
                    if idx < 0 or idx >= input_dim:
                        raise SelectorOutOfRangeError(
                            f"selector block '{bid}': index {idx} is out of range"
                            f" for input dim {input_dim}."
                        )
            plan._evaluators[bid] = _make_selector_eval(params)

        elif kind == "data_store_read":
            name = str(params.get("name", bid))
            if name not in plan.data_stores:
                raise UnresolvedDataStoreError(
                    f"data_store_read block '{bid}': unknown store '{name}'."
                )
            plan._evaluators[bid] = _make_data_store_read_eval(name)

        elif kind == "data_store_write":
            name = str(params.get("name", bid))
            if name not in plan.data_stores:
                raise UnresolvedDataStoreError(
                    f"data_store_write block '{bid}': unknown store '{name}'."
                )
            plan._evaluators[bid] = _make_data_store_write_eval(name)

        elif kind == "data_store_memory":
            name = str(params.get("name", bid))
            plan._evaluators[bid] = _make_data_store_memory_eval(name)

        elif kind == "mux":
            plan._evaluators[bid] = _make_mux_eval(params)

        elif kind == "bus_creator":
            plan._evaluators[bid] = _make_bus_creator_eval(params)

        elif kind == "bus_selector":
            plan._evaluators[bid] = _make_bus_selector_eval(params)

        elif kind == "bus_assignment":
            plan._evaluators[bid] = _make_bus_assignment_eval(params)

        elif kind == "merge":
            plan._evaluators[bid] = _make_merge_eval(params)

        elif kind == "manual_switch":
            plan._evaluators[bid] = _make_manual_switch_eval(params)

        elif kind == "multiport_switch":
            plan._evaluators[bid] = _make_multiport_switch_eval(params)

        elif kind == "switch":
            plan._evaluators[bid] = _make_switch_eval(params)

    return plan
