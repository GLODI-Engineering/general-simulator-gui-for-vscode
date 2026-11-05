"""Signal-flow block lowering to scipy ODE form (BE-37).

Implements ``lower_signal_flow(ir1) -> SignalFlowSystem``.  The result carries
a scipy-compatible ``rhs(t, x)`` closure, an ``output_map(t, x)`` closure, and
metadata about discrete-block sample times.
"""

from __future__ import annotations

import importlib.util
import pathlib
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from simulator.ir.ir1 import IR1Block, IR1Graph

# ---------------------------------------------------------------------------
# Path to the signal-flow block library
# ---------------------------------------------------------------------------

_BLOCKS_ROOT = (
    pathlib.Path(__file__).resolve().parents[5] / "packages" / "blocks" / "src" / "blocks"
)


# ---------------------------------------------------------------------------
# Public exception
# ---------------------------------------------------------------------------


class AlgebraicLoopError(Exception):
    """Raised when a direct-feedthrough cycle is detected in the signal-flow graph."""


# ---------------------------------------------------------------------------
# Internal block-entry container
# ---------------------------------------------------------------------------


@dataclass
class _BlockEntry:
    """Loaded signal-flow block with its equation instance and metadata."""

    block: IR1Block
    eq: Any  # Equations instance — loaded dynamically via importlib
    state_vars: list[str]
    is_discrete: bool
    sample_time: float | None
    has_direct_feedthrough: bool


# ---------------------------------------------------------------------------
# Public result dataclass
# ---------------------------------------------------------------------------


@dataclass
class SignalFlowSystem:
    """Result of lowering a signal-flow IR1Graph to an ODE-ready system.

    Attributes:
        state_vars:   Ordered list of ``(block_id, var_name)`` for every state
                      variable in the flat state vector.
        state_layout: Mapping ``(block_id, var_name) -> index`` in the vector.
        x0:           Initial state vector (one float per state variable).
        rhs:          ``f(t, x) -> dx`` — scipy-compatible ODE right-hand side.
                      Discrete-block states have dx=0 here; step them separately.
        output_map:   ``g(t, x) -> {(block_id, port_id): float}`` — compute all
                      block outputs at a given time/state.
        discrete_blocks: ``{block_id: sample_time}`` for every discrete block.
        eval_order:   Topological evaluation order (list of block instance IDs).
        blocks:       ``{block_id: _BlockEntry}`` — internal block registry.
    """

    state_vars: list[tuple[str, str]]
    state_layout: dict[tuple[str, str], int]
    x0: list[float]
    rhs: Callable[[float, Sequence[float]], list[float]]
    output_map: Callable[[float, Sequence[float]], dict[tuple[str, str], float]]
    discrete_blocks: dict[str, float]
    eval_order: list[str]
    blocks: dict[str, _BlockEntry] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Equations loader
# ---------------------------------------------------------------------------


def _load_equations(block_type: str, blocks_root: pathlib.Path) -> Any:
    """Load the ``Equations`` class for *block_type* by building the path.

    ``block_type`` is dot-separated, e.g. ``signal-flow.source.constant``.
    The corresponding equations.py is at
    ``<blocks_root>/signal-flow/source/constant/equations.py``.

    Returns an instantiated ``Equations`` object or ``None`` if not found.
    """
    parts = block_type.split(".")
    eq_path = blocks_root.joinpath(*parts) / "equations.py"
    if not eq_path.exists():
        return None
    module_name = "_sfl_eq_" + block_type.replace(".", "_").replace("-", "_")
    spec = importlib.util.spec_from_file_location(module_name, eq_path)
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    cls = getattr(mod, "Equations", None)
    if cls is None:
        return None
    return cls()


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------


def _build_feedthrough_graph(
    blocks: dict[str, _BlockEntry],
    connections: list[Any],
) -> tuple[dict[str, list[str]], dict[str, int]]:
    """Build adjacency list and in-degrees for direct-feedthrough edges.

    An edge src→dst is a *feedthrough edge* when the destination block has
    ``has_direct_feedthrough=True`` (its output depends on its current inputs).
    """
    adj: dict[str, list[str]] = {bid: [] for bid in blocks}
    in_degree: dict[str, int] = {bid: 0 for bid in blocks}
    seen: set[tuple[str, str]] = set()

    for conn in connections:
        src_bid: str = conn.src[0]
        dst_bid: str = conn.dst[0]
        if src_bid not in blocks or dst_bid not in blocks or src_bid == dst_bid:
            continue
        edge = (src_bid, dst_bid)
        if edge in seen:
            continue
        seen.add(edge)
        dst_entry = blocks[dst_bid]
        if dst_entry.has_direct_feedthrough:
            adj[src_bid].append(dst_bid)
            in_degree[dst_bid] += 1

    return adj, in_degree


def _detect_algebraic_loops(
    blocks: dict[str, _BlockEntry],
    connections: list[Any],
) -> None:
    """DFS cycle detection on the direct-feedthrough graph.

    Raises :class:`AlgebraicLoopError` with the cycle path if a loop is found.
    """
    adj, _ = _build_feedthrough_graph(blocks, connections)

    _white, _gray, _black = 0, 1, 2
    color: dict[str, int] = {bid: _white for bid in blocks}
    # Iterative DFS to avoid Python recursion limits on large graphs.
    for start in list(blocks):
        if color[start] != _white:
            continue
        stack: list[tuple[str, list[str]]] = [(start, list(adj[start]))]
        path: list[str] = [start]
        color[start] = _gray
        while stack:
            node, children = stack[-1]
            if children:
                child = children.pop(0)
                if color[child] == _gray:
                    # Cycle found — extract the cycle portion of the path.
                    cycle_start = path.index(child)
                    cycle = [*path[cycle_start:], child]
                    raise AlgebraicLoopError("Algebraic loop detected: " + " -> ".join(cycle))
                if color[child] == _white:
                    color[child] = _gray
                    path.append(child)
                    stack.append((child, list(adj[child])))
            else:
                color[node] = _black
                stack.pop()
                if path and path[-1] == node:
                    path.pop()


def _topological_sort(
    blocks: dict[str, _BlockEntry],
    connections: list[Any],
) -> list[str]:
    """Kahn's algorithm over ALL connections (not just feedthrough).

    Returns a topological evaluation order for all signal-flow blocks.
    Blocks with no incoming edges (sources) come first.
    """
    adj: dict[str, list[str]] = {bid: [] for bid in blocks}
    in_deg: dict[str, int] = {bid: 0 for bid in blocks}
    seen: set[tuple[str, str]] = set()

    for conn in connections:
        src_bid: str = conn.src[0]
        dst_bid: str = conn.dst[0]
        if src_bid not in blocks or dst_bid not in blocks or src_bid == dst_bid:
            continue
        edge = (src_bid, dst_bid)
        if edge in seen:
            continue
        seen.add(edge)
        adj[src_bid].append(dst_bid)
        in_deg[dst_bid] += 1

    queue: deque[str] = deque(bid for bid, deg in in_deg.items() if deg == 0)
    order: list[str] = []
    while queue:
        bid = queue.popleft()
        order.append(bid)
        for nbr in adj[bid]:
            in_deg[nbr] -= 1
            if in_deg[nbr] == 0:
                queue.append(nbr)

    # Any block not in order (due to cycles that weren't caught as feedthrough
    # loops) gets appended in original order.
    remaining = [bid for bid in blocks if bid not in set(order)]
    order.extend(remaining)
    return order


# ---------------------------------------------------------------------------
# Main lowering function
# ---------------------------------------------------------------------------


def lower_signal_flow(ir1: IR1Graph) -> SignalFlowSystem:
    """Lower all signal-flow blocks in *ir1* to a :class:`SignalFlowSystem`.

    Parameters
    ----------
    ir1:
        The IR-1 graph produced by the v2 loader/builder.

    Returns
    -------
    SignalFlowSystem
        Ready for use with scipy's ``solve_ivp`` via ``sys.rhs`` and
        ``sys.output_map``.

    Raises
    ------
    AlgebraicLoopError
        If a direct-feedthrough cycle is detected among signal-flow blocks.
    ValueError
        If no ``equations.py`` is found for a block type.
    """
    # ------------------------------------------------------------------
    # 1. Collect signal-flow blocks and load equations
    # ------------------------------------------------------------------
    entries: dict[str, _BlockEntry] = {}

    for b in ir1.blocks:
        if b.paradigm != "signal-flow" and not b.block_type.startswith("signal-flow."):
            continue

        eq = _load_equations(b.block_type, _BLOCKS_ROOT)
        if eq is None:
            raise ValueError(
                f"No equations.py found for signal-flow block type {b.block_type!r}. "
                f"Expected path: {_BLOCKS_ROOT.joinpath(*b.block_type.split('.'))}"
                f"/equations.py"
            )

        sv = eq.state_vars(b.params)
        is_discrete: bool = bool(getattr(eq, "is_discrete", False))
        has_dft: bool = bool(getattr(eq, "has_direct_feedthrough", True))

        sample_time: float | None = None
        if is_discrete:
            st_param: str = str(getattr(eq, "sample_time_param", "sample_time"))
            sample_time = float(b.params.get(st_param, 0.01))

        entries[b.instance_id] = _BlockEntry(
            block=b,
            eq=eq,
            state_vars=list(sv),
            is_discrete=is_discrete,
            sample_time=sample_time,
            has_direct_feedthrough=has_dft,
        )

    # ------------------------------------------------------------------
    # 2. Filter connections to signal-flow blocks only
    # ------------------------------------------------------------------
    sf_ids = set(entries)
    sf_connections = [c for c in ir1.connections if c.src[0] in sf_ids and c.dst[0] in sf_ids]

    # ------------------------------------------------------------------
    # 3. Algebraic loop detection (direct-feedthrough graph)
    # ------------------------------------------------------------------
    _detect_algebraic_loops(entries, sf_connections)

    # ------------------------------------------------------------------
    # 4. Topological sort
    # ------------------------------------------------------------------
    eval_order = _topological_sort(entries, sf_connections)

    # ------------------------------------------------------------------
    # 5. Build state layout and initial state vector
    # ------------------------------------------------------------------
    state_vars: list[tuple[str, str]] = []
    state_layout: dict[tuple[str, str], int] = {}
    x0: list[float] = []

    for bid in eval_order:
        entry = entries[bid]
        ic_dict: dict[str, Any] = dict(entry.block.ic) if entry.block.ic else {}
        params: dict[str, Any] = dict(entry.block.params) if entry.block.params else {}
        for var in entry.state_vars:
            key = (bid, var)
            idx = len(state_vars)
            state_vars.append(key)
            state_layout[key] = idx
            # IC priority: block.ic[var] > params["ic"] (single-state) > 0.0
            if var in ic_dict:
                x0.append(float(ic_dict[var]))
            elif "ic" in params and len(entry.state_vars) == 1:
                x0.append(float(params["ic"]))
            else:
                x0.append(0.0)

    discrete_blocks: dict[str, float] = {
        bid: entry.sample_time
        for bid, entry in entries.items()
        if entry.is_discrete and entry.sample_time is not None
    }

    # ------------------------------------------------------------------
    # 6. Build connection lookup: dst -> src
    # ------------------------------------------------------------------
    conn_map: dict[tuple[str, str], tuple[str, str]] = {}
    for c in sf_connections:
        conn_map[c.dst] = c.src

    # ------------------------------------------------------------------
    # 7. Closure state for trigger-edge detection
    # ------------------------------------------------------------------
    # Maps block_id -> previous trigger signal value (for edge detection).
    trigger_prev: dict[str, float] = {}

    # ------------------------------------------------------------------
    # 8. Core evaluation function
    # ------------------------------------------------------------------

    def _eval_outputs(t: float, x: Sequence[float]) -> dict[tuple[str, str], float]:
        """Evaluate all block *outputs* in topological order."""
        output_buf: dict[tuple[str, str], float] = {}

        for bid in eval_order:
            entry = entries[bid]
            b = entry.block

            # Gather inputs from output buffer via connection map.
            inputs: dict[str, float] = {}
            for (dst_bid, dst_port), (src_bid, src_port) in conn_map.items():
                if dst_bid == bid:
                    inputs[dst_port] = output_buf.get((src_bid, src_port), 0.0)

            # Extract state slice for this block.
            state: dict[str, float] = {}
            for var in entry.state_vars:
                idx = state_layout.get((bid, var))
                if idx is not None:
                    state[var] = float(x[idx])

            # ----- execution gating -----
            exec_kind = b.execution_kind

            if exec_kind == "enabled" and b.enable_signal is not None:
                enable_val = output_buf.get(b.enable_signal, 0.0)
                if enable_val <= 0.0:
                    # Output frozen: emit current state-derived output, no feedthrough.
                    outs: dict[str, float] = entry.eq.output(state, {}, b.params, t)
                    for port, val in outs.items():
                        output_buf[(bid, port)] = val
                    continue

            if exec_kind == "triggered" and b.trigger_signal is not None:
                trig_val = output_buf.get(b.trigger_signal, 0.0)
                prev_trig = trigger_prev.get(bid, 0.0)
                kind = b.trigger_kind or "rising"
                fired = _edge_detected(prev_trig, trig_val, kind)
                trigger_prev[bid] = trig_val
                if not fired:
                    # Frozen output.
                    outs = entry.eq.output(state, {}, b.params, t)
                    for port, val in outs.items():
                        output_buf[(bid, port)] = val
                    continue

            # Normal output evaluation.
            outs = entry.eq.output(state, inputs, b.params, t)
            for port, val in outs.items():
                output_buf[(bid, port)] = val

        return output_buf

    def rhs(t: float, x: Sequence[float]) -> list[float]:
        """ODE right-hand side: f(t, x) -> dx/dt.

        Continuous blocks contribute their state derivatives.
        Discrete-block states have derivative 0 (they are stepped separately).
        """
        # Snapshot trigger_prev BEFORE _eval_outputs mutates it so that the
        # derivative gating below uses the "before this step" previous value.
        trigger_prev_snapshot = dict(trigger_prev)
        output_buf = _eval_outputs(t, x)
        dx: list[float] = [0.0] * len(state_vars)

        for bid in eval_order:
            entry = entries[bid]
            if not entry.state_vars:
                continue
            if entry.is_discrete:
                continue  # Discrete states are not ODE derivatives.

            b = entry.block
            exec_kind = b.execution_kind

            # Enabled gating: freeze state when enable <= 0.
            if exec_kind == "enabled" and b.enable_signal is not None:
                enable_val = output_buf.get(b.enable_signal, 0.0)
                if enable_val <= 0.0:
                    continue  # dx = 0 → state frozen.

            # Triggered gating: only advance on edge.
            # Use the pre-_eval_outputs snapshot so the edge is not missed.
            if exec_kind == "triggered" and b.trigger_signal is not None:
                trig_val = output_buf.get(b.trigger_signal, 0.0)
                prev_trig = trigger_prev_snapshot.get(bid, 0.0)
                kind = b.trigger_kind or "rising"
                if not _edge_detected(prev_trig, trig_val, kind):
                    continue

            # Gather inputs.
            inputs: dict[str, float] = {}
            for (dst_bid, dst_port), (src_bid, src_port) in conn_map.items():
                if dst_bid == bid:
                    inputs[dst_port] = output_buf.get((src_bid, src_port), 0.0)

            # Extract state.
            state: dict[str, float] = {}
            for var in entry.state_vars:
                idx = state_layout.get((bid, var))
                if idx is not None:
                    state[var] = float(x[idx])

            dstate: dict[str, float] = entry.eq.rhs(state, inputs, b.params, t)
            for var, dval in dstate.items():
                idx = state_layout.get((bid, var))
                if idx is not None:
                    dx[idx] = dval

        return dx

    def output_map(t: float, x: Sequence[float]) -> dict[tuple[str, str], float]:
        """Compute all block outputs: g(t, x) -> {(block_id, port_id): value}."""
        return _eval_outputs(t, x)

    return SignalFlowSystem(
        state_vars=state_vars,
        state_layout=state_layout,
        x0=x0,
        rhs=rhs,
        output_map=output_map,
        discrete_blocks=discrete_blocks,
        eval_order=eval_order,
        blocks=entries,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _edge_detected(prev: float, curr: float, kind: str) -> bool:
    """Return True if a trigger edge of *kind* is detected."""
    if kind == "rising":
        return prev <= 0.0 and curr > 0.0
    if kind == "falling":
        return prev > 0.0 and curr <= 0.0
    if kind == "either":
        return (prev <= 0.0 and curr > 0.0) or (prev > 0.0 and curr <= 0.0)
    return False
