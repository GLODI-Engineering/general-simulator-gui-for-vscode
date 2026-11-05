"""Signal-dimension inference pass — load-time propagation (BE-43).

``propagate_dims(graph)`` reads each signal-flow block's ``port_sigs`` from
its catalogue metadata.yaml, runs a fixed-point propagation algorithm, and
attaches a ``dim: list[int]`` to every signal-flow IR1Connection.

Acausal wires (``kind`` starting with ``"physical"``) are skipped; their
``dim`` remains ``None``.

Raises
------
DimensionMismatchError
    Two conflicting concrete dimensions meet on the same wire or port, or a
    ``signal-flow.attributes.signal_specification`` block's declared dim
    disagrees with the propagated input dim.
DimensionUnresolvedError
    After propagation reaches a fixed point, one or more signal-flow
    connections still have ``dim = None`` (no concrete seed anywhere in the
    chain).
DimensionLoopError
    The unresolved connections form a directed cycle in the forward connection
    graph (inherit loop with no concrete seed).
"""

from __future__ import annotations

import pathlib
import re
from typing import Any

import yaml

from simulator.ir.ir1 import BusLayout, IR1Connection, IR1Graph

# ---------------------------------------------------------------------------
# Public error types
# ---------------------------------------------------------------------------

__all__ = [
    "BusLayout",
    "DimensionLoopError",
    "DimensionMismatchError",
    "DimensionUnresolvedError",
    "propagate_dims",
]


class DimensionMismatchError(Exception):
    """Raised when two known dimensions conflict on a wire or port."""


class DimensionUnresolvedError(Exception):
    """Raised when signal-flow connections remain dim=None after propagation."""


class DimensionLoopError(Exception):
    """Raised when an inherit cycle has no concrete seed."""


# ---------------------------------------------------------------------------
# Blocks-package root lookup (cached)
# ---------------------------------------------------------------------------

_blocks_root_cache: pathlib.Path | None = None


def _get_blocks_root() -> pathlib.Path:
    global _blocks_root_cache
    if _blocks_root_cache is not None:
        return _blocks_root_cache
    try:
        import blocks as _blocks_pkg

        _blocks_root_cache = pathlib.Path(_blocks_pkg.__file__).parent
        return _blocks_root_cache
    except ImportError:
        pass
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "blocks" / "src" / "blocks"
        if candidate.exists():
            _blocks_root_cache = candidate
            return _blocks_root_cache
    raise RuntimeError("Cannot find blocks package root")


def _load_port_sigs(block_type: str) -> dict[str, str]:
    """Return port_sigs dict for *block_type* from its metadata.yaml.

    Returns an empty dict if the metadata is missing or has no ``port_sigs``.
    """
    try:
        blocks_root = _get_blocks_root()
        path_part = block_type.replace(".", "/")
        metadata_path = blocks_root / path_part / "metadata.yaml"
        if metadata_path.exists():
            with metadata_path.open("r", encoding="utf-8") as fh:
                meta = yaml.safe_load(fh)
            if isinstance(meta, dict) and "port_sigs" in meta:
                return {str(k): str(v) for k, v in meta["port_sigs"].items()}
    except Exception:  # pragma: no cover
        pass
    return {}


# ---------------------------------------------------------------------------
# Dim-signature parsers
# ---------------------------------------------------------------------------

_LITERAL_RE = re.compile(r"^\s*\[([^\]]*)\]\s*$")
_FROM_RE = re.compile(r"^\s*from\(([^)]+)\)\s*$")
_SHAPE_RE = re.compile(r"^\s*shape\(([^)]+)\)\s*$")
_SUM_RE = re.compile(r"^\s*sum\(([^)]+)\)\s*$")
_PARTITION_RE = re.compile(r"^\s*partition\(([^,]+),\s*([^)]+)\)\s*$")
_BUS_RE = re.compile(r"^\s*bus\(([^)]+)\)\s*$")


def _parse_literal(sig: str) -> list[int] | None:
    m = _LITERAL_RE.match(sig)
    if not m:
        return None
    parts = [p.strip() for p in m.group(1).split(",") if p.strip()]
    try:
        return [int(p) for p in parts]
    except ValueError:
        return None


def _parse_from(sig: str) -> str | None:
    m = _FROM_RE.match(sig)
    return m.group(1).strip() if m else None


def _parse_shape(sig: str) -> str | None:
    m = _SHAPE_RE.match(sig)
    return m.group(1).strip() if m else None


def _parse_sum(sig: str) -> str | None:
    m = _SUM_RE.match(sig)
    return m.group(1).strip() if m else None


def _parse_partition(sig: str) -> tuple[str, str] | None:
    m = _PARTITION_RE.match(sig)
    return (m.group(1).strip(), m.group(2).strip()) if m else None


def _parse_bus(sig: str) -> str | None:
    m = _BUS_RE.match(sig)
    return m.group(1).strip() if m else None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GLOB_CACHE: dict[str, re.Pattern[str]] = {}


def _glob_to_re(pattern: str) -> re.Pattern[str]:
    if pattern not in _GLOB_CACHE:
        regex = "^" + re.escape(pattern).replace(r"\*", ".*") + "$"
        _GLOB_CACHE[pattern] = re.compile(regex)
    return _GLOB_CACHE[pattern]


def _match_pattern(pattern: str, port_ids: list[str]) -> list[str]:
    """Return port_ids that match *pattern* (which may contain ``*``)."""
    if "*" not in pattern:
        return [pattern] if pattern in port_ids else []
    rx = _glob_to_re(pattern)
    return [pid for pid in port_ids if rx.match(pid)]


def _shape_from_value(value: Any) -> list[int]:
    """Compute dimension list from a parameter value."""
    if isinstance(value, list | tuple):
        return [len(value)]
    return [1]


def _port_index(port_id: str, ordered_ports: list[str]) -> int | None:
    """Extract numeric suffix from *port_id*, or fall back to sorted position."""
    m = re.search(r"(\d+)$", port_id)
    if m:
        return int(m.group(1))
    srt = sorted(ordered_ports)
    try:
        return srt.index(port_id)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Internal dim-registry helpers
# ---------------------------------------------------------------------------

PortKey = tuple[str, str]  # (block_instance_id, port_id)
PortDimMap = dict[PortKey, list[int]]


def _set_dim(
    port_dim: PortDimMap,
    key: PortKey,
    dim: list[int],
    *,
    context: str = "",
) -> bool:
    """Set *key* → *dim*; return ``True`` if this is a new assignment.

    Raises ``DimensionMismatchError`` if the key already has a different dim.
    """
    existing = port_dim.get(key)
    if existing is None:
        port_dim[key] = list(dim)
        return True
    if existing != dim:
        detail = f" ({context})" if context else ""
        raise DimensionMismatchError(
            f"Dimension conflict at port {key[0]!r}:{key[1]!r}{detail}: "
            f"existing={existing}, new={dim}"
        )
    return False


# ---------------------------------------------------------------------------
# Main pass
# ---------------------------------------------------------------------------


def propagate_dims(graph: IR1Graph) -> IR1Graph:
    """Propagate signal dimensions and populate ``IR1Connection.dim``.

    Parameters
    ----------
    graph:
        The ``IR1Graph`` produced by ``ir1_builder.build()``.  Connections
        are modified **in-place**; the same object is returned.

    Returns
    -------
    IR1Graph
        *graph* with every signal-flow connection's ``dim`` field populated.

    Raises
    ------
    DimensionMismatchError
    DimensionUnresolvedError
    DimensionLoopError
    """
    # ------------------------------------------------------------------
    # 0. Index blocks; load port signatures.
    # ------------------------------------------------------------------
    block_by_id = {b.instance_id: b for b in graph.blocks}
    block_port_sigs: dict[str, dict[str, str]] = {
        b.instance_id: _load_port_sigs(b.block_type) for b in graph.blocks
    }

    # Build per-block port inventories from the connection graph.
    # We only care about signal-flow connections.
    blk_in_ports: dict[str, list[str]] = {}  # block_id -> [input port ids]
    blk_out_ports: dict[str, list[str]] = {}  # block_id -> [output port ids]
    for c in graph.connections:
        if c.kind.startswith("physical"):
            continue
        src_bid, src_pid = c.src
        dst_bid, dst_pid = c.dst
        blk_out_ports.setdefault(src_bid, [])
        if src_pid not in blk_out_ports[src_bid]:
            blk_out_ports[src_bid].append(src_pid)
        blk_in_ports.setdefault(dst_bid, [])
        if dst_pid not in blk_in_ports[dst_bid]:
            blk_in_ports[dst_bid].append(dst_pid)

    port_dim: PortDimMap = {}

    # ------------------------------------------------------------------
    # 1. Phase 1 — seed literal dims and shape(key) dims.
    #    signal_specification blocks get both ports pinned to params.dim.
    # ------------------------------------------------------------------
    signal_spec_type = "signal-flow.attributes.signal_specification"
    signal_spec_constraints: dict[str, list[int]] = {}  # block_id -> constraint

    for b in graph.blocks:
        if b.block_type == signal_spec_type:
            raw_dim = b.params.get("dim", [1])
            if isinstance(raw_dim, int):
                constraint: list[int] = [raw_dim]
            else:
                constraint = [int(x) for x in raw_dim]
            signal_spec_constraints[b.instance_id] = constraint
            # Pin both input and output — acts as a hard seed.
            _set_dim(port_dim, (b.instance_id, "in"), constraint, context="signal_specification")
            _set_dim(port_dim, (b.instance_id, "out"), constraint, context="signal_specification")
            continue

        sigs = block_port_sigs[b.instance_id]
        all_ports = list(
            dict.fromkeys(
                blk_in_ports.get(b.instance_id, []) + blk_out_ports.get(b.instance_id, [])
            )
        )

        for pattern, sig in sigs.items():
            matched = _match_pattern(pattern, all_ports)
            if not matched and "*" not in pattern:
                # Pattern is a literal port id; include it even if not in
                # the connection graph (e.g. unconnected source port).
                matched = [pattern]

            for port_id in matched:
                key: PortKey = (b.instance_id, port_id)

                lit = _parse_literal(sig)
                if lit is not None:
                    _set_dim(port_dim, key, lit)
                    continue

                params_key = _parse_shape(sig)
                if params_key is not None:
                    val = b.params.get(params_key)
                    if val is not None:
                        _set_dim(port_dim, key, _shape_from_value(val))
                    continue
                # Other sig types (inherit, from, sum, partition, bus)
                # are resolved in phase 2.

    # ------------------------------------------------------------------
    # 2. Phase 2 — iterative propagation until fixed point.
    # ------------------------------------------------------------------
    max_iters = (len(graph.connections) + len(graph.blocks)) * 4 + 32

    for _ in range(max_iters):
        changed = False

        # --- 2a. Propagate through connections (bidirectional). --------
        for c in graph.connections:
            if c.kind.startswith("physical"):
                continue
            src_dim = port_dim.get(c.src)
            dst_dim = port_dim.get(c.dst)

            if src_dim is not None and dst_dim is None:
                if _set_dim(port_dim, c.dst, src_dim):
                    changed = True
            elif dst_dim is not None and src_dim is None:
                if _set_dim(port_dim, c.src, dst_dim):
                    changed = True
            elif src_dim is not None and dst_dim is not None and src_dim != dst_dim:
                # Determine a helpful error message.
                src_blk = block_by_id.get(c.src[0])
                dst_blk = block_by_id.get(c.dst[0])
                src_type = src_blk.block_type if src_blk else "?"
                dst_type = dst_blk.block_type if dst_blk else "?"
                raise DimensionMismatchError(
                    f"Dimension mismatch on wire "
                    f"{c.src[0]!r}:{c.src[1]!r}({src_type}) → "
                    f"{c.dst[0]!r}:{c.dst[1]!r}({dst_type}): "
                    f"{src_dim} vs {dst_dim}"
                )

        # --- 2b. Intra-block propagation via dim-sig formulas. ---------
        for b in graph.blocks:
            if b.block_type == signal_spec_type:
                continue  # already fully seeded in phase 1

            sigs = block_port_sigs[b.instance_id]
            all_ports = list(
                dict.fromkeys(
                    blk_in_ports.get(b.instance_id, []) + blk_out_ports.get(b.instance_id, [])
                )
            )

            for pattern, sig in sigs.items():
                matched = _match_pattern(pattern, all_ports)
                if not matched and "*" not in pattern:
                    matched = [pattern]

                # Collect all matched ports that are still unresolved.
                for port_id in matched:
                    key = (b.instance_id, port_id)
                    key_known = port_dim.get(key) is not None

                    # from(<ref_port>)
                    # NOTE: even when *key* is already resolved we must
                    # re-validate, because the spec constraint may have
                    # back-propagated a value onto this port before the
                    # upstream ref_port was resolved.  If both are now
                    # known and they disagree, raise immediately.
                    ref_port = _parse_from(sig)
                    if ref_port is not None:
                        ref_dim = port_dim.get((b.instance_id, ref_port))
                        # _set_dim raises DimensionMismatchError on conflict
                        if ref_dim is not None and _set_dim(port_dim, key, ref_dim):
                            changed = True
                        continue

                    if key_known:
                        continue  # already known; no further formula to apply

                    # sum(<pattern>)
                    sum_pat = _parse_sum(sig)
                    if sum_pat is not None:
                        matching_inputs = _match_pattern(sum_pat, all_ports)
                        dims = [port_dim.get((b.instance_id, p)) for p in matching_inputs]
                        if dims and all(d is not None for d in dims):
                            known_dims: list[list[int]] = [d for d in dims if d is not None]
                            total = sum(d[0] for d in known_dims)
                            if _set_dim(port_dim, key, [total]):
                                changed = True
                        continue

                    # partition(<input_port>, <params_key>)
                    part = _parse_partition(sig)
                    if part is not None:
                        input_port, params_key = part
                        input_dim = port_dim.get((b.instance_id, input_port))
                        partition_spec = b.params.get(params_key)
                        if input_dim is not None and partition_spec is not None:
                            all_out_ports = _match_pattern(pattern, all_ports)
                            idx = _port_index(port_id, all_out_ports)
                            if (
                                idx is not None
                                and idx < len(partition_spec)
                                and _set_dim(port_dim, key, [int(partition_spec[idx])])
                            ):
                                changed = True
                        continue

                    # bus(<params_key>) — produces a BusLayout
                    bus_key = _parse_bus(sig)
                    if bus_key is not None:
                        bus_spec = b.params.get(bus_key)
                        if bus_spec is not None and isinstance(bus_spec, list | dict):
                            layout = _build_bus_layout(bus_spec)
                            total_dim = sum(d for _, dims in layout.elements for d in dims)
                            if _set_dim(port_dim, key, [total_dim]):
                                changed = True
                                # Also store the layout on any connection whose
                                # src is this port (done in phase 3).
                        continue

                    # inherit — handled purely via connection propagation (2a).
                    # No action needed here.

        if not changed:
            break

    # ------------------------------------------------------------------
    # 3. Phase 3 — validate signal_specification hard constraints.
    # ------------------------------------------------------------------
    for b in graph.blocks:
        if b.block_type != signal_spec_type:
            continue
        spec_constraint = signal_spec_constraints.get(b.instance_id)
        if spec_constraint is None:
            continue
        # If upstream wires fed a different dim into the input port, the
        # conflict would already have been raised in phase 2a.  The check
        # here is a final guard for the post-propagation state.
        in_dim = port_dim.get((b.instance_id, "in"))
        if in_dim is not None and in_dim != spec_constraint:
            raise DimensionMismatchError(
                f"signal_specification block {b.instance_id!r} declared "
                f"dim={spec_constraint} but propagated input dim={in_dim}"
            )

    # ------------------------------------------------------------------
    # 4. Phase 4 — assign dims to connections; collect unresolved.
    # ------------------------------------------------------------------
    unresolved: list[IR1Connection] = []

    for c in graph.connections:
        if c.kind.startswith("physical"):
            c.dim = None
            continue

        src_dim = port_dim.get(c.src)
        dst_dim = port_dim.get(c.dst)
        wire_dim = src_dim if src_dim is not None else dst_dim

        if wire_dim is None:
            unresolved.append(c)
        else:
            c.dim = wire_dim

    if unresolved:
        _raise_unresolved_or_loop(unresolved, graph)

    return graph


# ---------------------------------------------------------------------------
# Cycle vs. unresolved detection
# ---------------------------------------------------------------------------


def _raise_unresolved_or_loop(
    unresolved: list[IR1Connection],
    graph: IR1Graph,
) -> None:
    """Detect whether *unresolved* connections form an inherit loop or not.

    Raises ``DimensionLoopError`` if a directed cycle is found in the forward
    connection graph restricted to unresolved blocks, otherwise raises
    ``DimensionUnresolvedError``.
    """
    import networkx as nx

    # Nodes = block ids of unresolved connections.
    unresolved_blocks: set[str] = set()
    for c in unresolved:
        unresolved_blocks.add(c.src[0])
        unresolved_blocks.add(c.dst[0])

    # Forward connection graph: src_block → dst_block (for unresolved blocks).
    fwd_graph: nx.DiGraph = nx.DiGraph()
    fwd_graph.add_nodes_from(unresolved_blocks)
    for c in graph.connections:
        if c.kind.startswith("physical"):
            continue
        src_b, dst_b = c.src[0], c.dst[0]
        if src_b in unresolved_blocks and dst_b in unresolved_blocks:
            fwd_graph.add_edge(src_b, dst_b)

    try:
        cycles = list(nx.simple_cycles(fwd_graph))
    except Exception:
        cycles = []

    if cycles:
        # Report the first cycle found.
        cycle = cycles[0]
        cycle_path = " → ".join(cycle) + f" → {cycle[0]}"
        raise DimensionLoopError(
            f"Signal-dimension inherit cycle with no concrete seed: {cycle_path}"
        )

    raise DimensionUnresolvedError(
        f"Signal-flow connections have unresolved dimensions after propagation "
        f"(no concrete seed). Unresolved src ports: "
        f"{[c.src for c in unresolved]}"
    )


# ---------------------------------------------------------------------------
# BusLayout builder
# ---------------------------------------------------------------------------


def _build_bus_layout(spec: list[Any] | dict[str, Any]) -> BusLayout:
    """Build a BusLayout from a ``bus(key)`` parameter value.

    Accepts either:
    * a list of ``{name: str, dim: int | list[int]}`` dicts, or
    * a dict mapping element names to dims.
    """
    elements: list[tuple[str, list[int]]] = []
    if isinstance(spec, dict):
        for name, dim_raw in spec.items():
            dim = [dim_raw] if isinstance(dim_raw, int) else list(dim_raw)
            elements.append((str(name), dim))
    elif isinstance(spec, list):
        for item in spec:
            if isinstance(item, dict):
                name = str(item.get("name", ""))
                dim_raw2 = item.get("dim", 1)
                dim2 = [dim_raw2] if isinstance(dim_raw2, int) else list(dim_raw2)
                elements.append((name, dim2))
    return BusLayout(elements=elements)
