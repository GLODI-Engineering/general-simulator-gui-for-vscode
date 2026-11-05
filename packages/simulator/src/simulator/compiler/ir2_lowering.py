"""IR-1 → IR-2 lowering for the control-block subset (BE-13).

Walks IR-1, instantiates each block's Equations class, allocates state slots
in a flat state vector, computes topological evaluation order, and rejects
algebraic loops (no integrator/state block to break them).
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque

from simulator.equation_templates.loader import get_registry
from simulator.ir.ir1 import IR1Graph
from simulator.ir.ir2 import InstantiatedBlock, IR2System

logger = logging.getLogger(__name__)

# Block types that are known to have circuit elements (electrical/thermal).
# Always empty in v1 — but the check is wired for future use.
_CIRCUIT_BLOCK_TYPES: frozenset[str] = frozenset()


def lower(ir1: IR1Graph, intent: str = "transient_control") -> IR2System:
    """Lower an IR1Graph to an IR2System.

    Raises ValueError on algebraic loops or unknown block types.
    """
    registry = get_registry()
    ir2 = IR2System()
    ir2.connections = [(conn.src, conn.dst) for conn in ir1.connections]

    # Instantiate all blocks.
    block_map: dict[str, InstantiatedBlock] = {}
    for b in ir1.blocks:
        entry = registry.get(b.block_type)
        if entry is None:
            # Circuit/physical domain blocks are not supported in Phase 1.
            # They require Xyce (Phase 2). Give an actionable error message.
            _circuit_prefixes = (
                "power.",
                "electrical.",
                "analog.",
                "spice.",
                "circuit.",
                "passive.",
                "source.",
                "semi.",
                "tline.",
            )
            if any(b.block_type.startswith(pfx) for pfx in _circuit_prefixes):
                raise ValueError(
                    f"Block type {b.block_type!r} is a circuit/physical element. "
                    "Phase 2 (Xyce) is required to simulate circuit elements. "
                    "Only signal-domain blocks are supported in Phase 1."
                )
            raise ValueError(
                f"Unknown block type {b.block_type!r}. "
                "Ensure equations.py is present and the template loaded correctly."
            )
        state_vars = entry.equations.state_vars(b.params)
        causality: str = entry.metadata.get("behavior", {}).get("causality", "causal")
        inst = InstantiatedBlock(
            block=b,
            equations=entry.equations,
            state_vars=state_vars,
            causality=causality,
        )
        block_map[b.instance_id] = inst
        ir2.blocks.append(inst)

        if causality == "source":
            ir2.sources.append(b.instance_id)
        elif causality == "sink":
            ir2.sinks.append(b.instance_id)

        if b.block_type in _CIRCUIT_BLOCK_TYPES:
            ir2.has_circuit_elements = True

    # Build state layout.
    state_index = 0
    for inst in ir2.blocks:
        for var in inst.state_vars:
            ir2.state_layout[(inst.block.instance_id, var)] = state_index
            state_index += 1

    # Build output layout.
    output_index = 0
    for inst in ir2.blocks:
        block_type_meta = registry.get(inst.block.block_type)
        if block_type_meta is None:
            continue
        ports_out = block_type_meta.metadata.get("ports", {}).get("outputs", [])
        # For sum block, also include variadic outputs if any.
        for port in ports_out:
            ir2.output_layout[(inst.block.instance_id, port["id"])] = output_index
            output_index += 1

    # Compute topological eval order via Kahn's algorithm.
    eval_order = _topological_sort(ir1, block_map)
    ir2.eval_order = eval_order

    # Build initial state vector.
    n_states = len(ir2.state_layout)
    x0 = [0.0] * n_states
    for inst in ir2.blocks:
        x0_val = inst.block.params.get("x0", 0.0)
        for var in inst.state_vars:
            idx = ir2.state_layout.get((inst.block.instance_id, var))
            if idx is not None and var == "x":
                x0[idx] = float(x0_val)
    ir2.x0 = x0

    return ir2


def _topological_sort(ir1: IR1Graph, block_map: dict[str, InstantiatedBlock]) -> list[str]:
    """Kahn's algorithm topological sort; raises ValueError on cycles.

    Connections from stateful blocks (blocks with state variables) are treated
    as "state-breaking" — the stateful block's output comes from its state
    (previous time step) and does not create a topological dependency on the
    current step. This correctly allows feedback through integrators.

    True algebraic loops — feedback paths with no stateful block — are
    detected and rejected.
    """
    # Build adjacency: src_block -> set of dst_blocks (causal dependency).
    # Exclude edges where the src block is stateful (output comes from state).
    adjacency: dict[str, set[str]] = defaultdict(set)
    in_degree: dict[str, int] = {b.instance_id: 0 for b in ir1.blocks}

    for conn in ir1.connections:
        src_id = conn.src[0]
        dst_id = conn.dst[0]
        src_inst = block_map.get(src_id)
        # If the source block has state variables, its output is derived from
        # state (not from current-step inputs), so it does not create a
        # topological dependency.
        if src_inst is not None and src_inst.state_vars:
            continue
        if dst_id not in adjacency[src_id]:
            adjacency[src_id].add(dst_id)
            in_degree[dst_id] = in_degree.get(dst_id, 0) + 1

    # Sinks must be evaluated last. Use two queues: non-sinks first, sinks after.
    def _is_sink(bid: str) -> bool:
        inst = block_map.get(bid)
        return inst is not None and inst.causality == "sink"

    ready_normal: deque[str] = deque(
        bid for bid, deg in in_degree.items() if deg == 0 and not _is_sink(bid)
    )
    ready_sinks: deque[str] = deque(
        bid for bid, deg in in_degree.items() if deg == 0 and _is_sink(bid)
    )
    order: list[str] = []

    while ready_normal or ready_sinks:
        # Drain non-sink ready nodes before processing sinks.
        queue = ready_normal if ready_normal else ready_sinks
        node = queue.popleft()
        order.append(node)
        for neighbor in adjacency[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                if _is_sink(neighbor):
                    ready_sinks.append(neighbor)
                else:
                    ready_normal.append(neighbor)

    if len(order) != len(ir1.blocks):
        cycle_ids = [bid for bid, deg in in_degree.items() if deg > 0]
        raise ValueError(
            f"Algebraic loop detected involving block(s): {cycle_ids}. "
            "A feedback path must contain at least one stateful block (e.g. integrator) "
            "to break the loop."
        )

    return order


lower_to_ir2 = lower
