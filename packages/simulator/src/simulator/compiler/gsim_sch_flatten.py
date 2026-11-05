"""gsim_sch_flatten — subsystem flattening pass (BE-32).

Public API
----------
flatten(doc)  → ModelDocument
    Inlines all hierarchy.subsystem.* blocks into a single flat block/wire
    list.  Returns a new ModelDocument; the input is not mutated.

FlattenError
    ValueError subclass raised when the flat id space has a duplicate
    (spec §17.1.3).

UnsupportedSubsystemError
    ValueError subclass raised for hierarchy.subsystem.iterator and
    function-call subsystem variants (out of v2 scope per spec §11.2).
"""

from __future__ import annotations

import copy
import uuid
from typing import Any

from simulator.compiler.gsim_sch_loader import ModelDocument

# ---------------------------------------------------------------------------
# Public exceptions
# ---------------------------------------------------------------------------


class FlattenError(ValueError):
    """Raised when flattening would produce duplicate block ids."""


class UnsupportedSubsystemError(ValueError):
    """Raised for subsystem variants not supported in v2 (iterator, function-call)."""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_UNSUPPORTED_VARIANTS = ("iterator",)


def flatten(doc: ModelDocument) -> ModelDocument:
    """Flatten all subsystems into a single-level ModelDocument.

    Parameters
    ----------
    doc:
        A validated :class:`ModelDocument` as returned by
        :func:`~simulator.compiler.gsim_sch_loader.load`.

    Returns
    -------
    ModelDocument
        A new document whose ``model.blocks`` and ``model.wires`` contain
        only leaf blocks and their direct connections.  The
        ``schema_version`` and ``resolved_params`` are carried over
        unchanged.

    Raises
    ------
    FlattenError
        When two blocks would share the same id after namespacing.
    UnsupportedSubsystemError
        When a ``hierarchy.subsystem.iterator`` or function-call subsystem
        is encountered.
    """
    model = copy.deepcopy(doc.model)

    flat_blocks, flat_wires = _flatten_level(
        blocks=model.get("blocks", []),
        wires=model.get("wires", []),
        prefix="",
        parent_resolved=doc.resolved_params,
    )

    # Check id uniqueness after flattening (spec §17.1.3).
    ids = [b["id"] for b in flat_blocks]
    seen: set[str] = set()
    for bid in ids:
        if bid in seen:
            raise FlattenError(f"Duplicate block id after flattening: {bid!r}")
        seen.add(bid)

    new_model = {**model, "blocks": flat_blocks, "wires": flat_wires}
    return ModelDocument(
        schema_version=doc.schema_version,
        model=new_model,
        resolved_params=doc.resolved_params,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _join(prefix: str, bid: str) -> str:
    """Return ``prefix/bid`` when *prefix* is non-empty, else just *bid*."""
    return f"{prefix}/{bid}" if prefix else bid


def _find_incoming_source(
    wires: list[dict[str, Any]],
    block_id: str,
    port_id: str,
) -> dict[str, str] | None:
    """Return the ``from`` endpoint of the first wire reaching *block_id*.*port_id*."""
    for w in wires:
        if w["to"]["block"] == block_id and w["to"]["port"] == port_id:
            return {"block": w["from"]["block"], "port": w["from"]["port"]}
    return None


def _make_wire(
    src_block: str,
    src_port: str,
    dst_block: str,
    dst_port: str,
    kind: str = "signal",
) -> dict[str, Any]:
    """Create a minimal wire dict connecting *src* to *dst*."""
    return {
        "id": f"_flat_{uuid.uuid4().hex[:8]}",
        "from": {"block": src_block, "port": src_port},
        "to": {"block": dst_block, "port": dst_port},
        "waypoints": [],
        "pinned": False,
        "net": None,
        "kind": kind,
        "label": None,
    }


def _apply_param_aliases(
    block: dict[str, Any],
    alias_map: dict[str, Any],
) -> dict[str, Any]:
    """Return a copy of *block* with param references resolved via *alias_map*.

    A param value that is a string exactly matching a child alias name is
    replaced with the aliased value (a resolved float or the parent value
    expression).  Other param values are left unchanged.
    """
    if not alias_map:
        return block
    new_params = {}
    for k, v in block.get("params", {}).items():
        if isinstance(v, str) and v in alias_map:
            new_params[k] = alias_map[v]
        else:
            new_params[k] = v
    return {**block, "params": new_params}


def _collect_all_block_ids(model: dict[str, Any]) -> list[str]:
    """Recursively collect every block id from *model* and its subsystems."""
    ids: list[str] = []
    for block in model.get("blocks", []):
        ids.append(block["id"])
        sub = block.get("subsystem")
        if isinstance(sub, dict):
            ids.extend(_collect_all_block_ids(sub))
    return ids


def _flatten_level(
    blocks: list[dict[str, Any]],
    wires: list[dict[str, Any]],
    prefix: str,
    parent_resolved: dict[str, float],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Recursively flatten one model level.

    Parameters
    ----------
    blocks:
        The ``model.blocks`` list at the current level.
    wires:
        The ``model.wires`` list at the current level.
    prefix:
        Namespace prefix accumulated so far (e.g. ``"ctrl1"`` when
        processing the inside of a subsystem whose outer id is ``ctrl1``).
        Empty string at the top level.
    parent_resolved:
        Resolved scalar param values visible at this level (including any
        aliases injected by the parent subsystem).

    Returns
    -------
    (flat_blocks, flat_wires)
        All leaf blocks with namespaced ids and all direct wires.
    """
    flat_blocks: list[dict[str, Any]] = []
    flat_wires: list[dict[str, Any]] = []

    # Ids of blocks at this level that are being dissolved.
    inport_outport_ids: set[str] = set()
    subsystem_ids: set[str] = set()

    for block in blocks:
        t = block["type"]
        if t in ("hierarchy.inport", "hierarchy.outport"):
            inport_outport_ids.add(block["id"])
        elif t.startswith("hierarchy.subsystem."):
            subsystem_ids.add(block["id"])

    dissolved_ids = inport_outport_ids | subsystem_ids

    # Wires to skip at this level (they're replaced by bridge wires).
    outer_wires_to_skip: set[str] = set()

    # ---------- Process each block at this level ----------
    for block in blocks:
        bid = block["id"]
        btype = block["type"]

        if btype in ("hierarchy.inport", "hierarchy.outport"):
            # Removed: these become transparent after flattening.
            continue

        if not btype.startswith("hierarchy.subsystem."):
            # Regular leaf block — namespace its id and carry it forward.
            nb = _apply_param_aliases(copy.deepcopy(block), {})
            nb["id"] = _join(prefix, bid)
            flat_blocks.append(nb)
            continue

        # ---- Subsystem block ----
        variant = btype[len("hierarchy.subsystem.") :]
        if variant in _UNSUPPORTED_VARIANTS or "function-call" in btype:
            raise UnsupportedSubsystemError(f"Subsystem variant '{btype}' not implemented in v2")

        sub: dict[str, Any] = block.get("subsystem") or {}
        sub_prefix = _join(prefix, bid)

        # Determine execution-kind metadata for inner blocks.
        exec_kind: str | None
        exec_extra: dict[str, Any]

        if variant == "virtual":
            exec_kind = None
            exec_extra = {}
        elif variant == "atomic":
            exec_kind = "atomic"
            exec_extra = {}
        elif variant == "enabled":
            exec_kind = "enabled"
            enable_src = _find_incoming_source(wires, bid, "enable")
            exec_extra = {"enable_signal": enable_src}
            # The enable wire itself is consumed; mark it to skip.
            for w in wires:
                if w["to"]["block"] == bid and w["to"]["port"] == "enable":
                    outer_wires_to_skip.add(w["id"])
        elif variant == "triggered":
            exec_kind = "triggered"
            trigger_src = _find_incoming_source(wires, bid, "trigger")
            trigger_kind = block.get("params", {}).get("trigger_kind", "rising")
            exec_extra = {
                "trigger_signal": trigger_src,
                "trigger_kind": trigger_kind,
            }
            for w in wires:
                if w["to"]["block"] == bid and w["to"]["port"] == "trigger":
                    outer_wires_to_skip.add(w["id"])
        else:
            raise UnsupportedSubsystemError(f"Unknown subsystem variant: '{btype}'")

        # Build child resolved params by applying parent_param_aliases.
        child_resolved = dict(parent_resolved)
        alias_map: dict[str, Any] = {}
        for alias in sub.get("parent_param_aliases", []):
            child_name = alias["child"]
            parent_name = alias["parent"]
            if parent_name in parent_resolved:
                resolved_val = parent_resolved[parent_name]
                child_resolved[child_name] = resolved_val
                alias_map[child_name] = resolved_val

        inner_blocks_raw: list[dict[str, Any]] = sub.get("blocks", [])
        inner_wires_raw: list[dict[str, Any]] = sub.get("wires", [])

        # Ids of boundary blocks (inport/outport) inside this subsystem.
        inner_boundary_ids: set[str] = {
            b["id"]
            for b in inner_blocks_raw
            if b["type"] in ("hierarchy.inport", "hierarchy.outport")
        }

        # Recursively flatten inner level (with param alias resolution).
        # Temporarily apply aliases to inner blocks before recursion.
        resolved_inner_blocks = [_apply_param_aliases(b, alias_map) for b in inner_blocks_raw]
        inner_flat_blocks, inner_flat_wires = _flatten_level(
            blocks=resolved_inner_blocks,
            wires=inner_wires_raw,
            prefix=sub_prefix,
            parent_resolved=child_resolved,
        )

        # Attach execution-kind metadata to every flattened inner block.
        if exec_kind is not None:
            for ib in inner_flat_blocks:
                md: dict[str, Any] = ib.setdefault("metadata", {})
                md["execution_kind"] = exec_kind
                md.update(exec_extra)

        flat_blocks.extend(inner_flat_blocks)

        # ---- Boundary wire rewiring ----
        # Namespaced ids of inner boundary blocks (as they appear in
        # inner_flat_wires endpoints after namespacing).
        inner_boundary_namespaced: set[str] = {
            _join(sub_prefix, bid_b) for bid_b in inner_boundary_ids
        }

        ports: list[dict[str, Any]] = sub.get("ports", [])

        for port in ports:
            boundary_bid = port["boundary_block"]
            port_id = port["id"]
            direction = port["direction"]
            port_kind = port.get("kind", "signal")

            if direction == "in":
                # Outer wires arriving at sub_block.port_id.
                outer_in = [
                    w for w in wires if w["to"]["block"] == bid and w["to"]["port"] == port_id
                ]
                # Inner wires leaving the inport boundary block.
                # Use raw inner wires so block ids are un-namespaced.
                inner_from = [w for w in inner_wires_raw if w["from"]["block"] == boundary_bid]
                for ow in outer_in:
                    outer_wires_to_skip.add(ow["id"])
                    for iw in inner_from:
                        dst_block = _join(sub_prefix, iw["to"]["block"])
                        dst_port = iw["to"]["port"]
                        bridge = _make_wire(
                            src_block=ow["from"]["block"],
                            src_port=ow["from"]["port"],
                            dst_block=dst_block,
                            dst_port=dst_port,
                            kind=ow.get("kind") or port_kind,
                        )
                        flat_wires.append(bridge)

            elif direction == "out":
                # Outer wires leaving from sub_block.port_id.
                outer_out = [
                    w for w in wires if w["from"]["block"] == bid and w["from"]["port"] == port_id
                ]
                # Inner wires arriving at the outport boundary block.
                inner_to = [w for w in inner_wires_raw if w["to"]["block"] == boundary_bid]
                for ow in outer_out:
                    outer_wires_to_skip.add(ow["id"])
                    for iw in inner_to:
                        src_block = _join(sub_prefix, iw["from"]["block"])
                        src_port = iw["from"]["port"]
                        bridge = _make_wire(
                            src_block=src_block,
                            src_port=src_port,
                            dst_block=ow["to"]["block"],
                            dst_port=ow["to"]["port"],
                            kind=ow.get("kind") or port_kind,
                        )
                        flat_wires.append(bridge)

        # Add inner flat wires, skipping those touching boundary blocks.
        for ifw in inner_flat_wires:
            if (
                ifw["from"]["block"] in inner_boundary_namespaced
                or ifw["to"]["block"] in inner_boundary_namespaced
            ):
                continue
            flat_wires.append(ifw)

    # ---------- Add regular wires from this level ----------
    for wire in wires:
        if wire["id"] in outer_wires_to_skip:
            continue
        from_block = wire["from"]["block"]
        to_block = wire["to"]["block"]
        # Skip wires that touch dissolved blocks (subsystems, inports, outports);
        # they were already handled above or are consumed by boundary logic.
        if from_block in dissolved_ids or to_block in dissolved_ids:
            continue
        # Namespace the endpoint block ids.
        nw = copy.deepcopy(wire)
        nw["from"] = {
            "block": _join(prefix, from_block),
            "port": wire["from"]["port"],
        }
        nw["to"] = {
            "block": _join(prefix, to_block),
            "port": wire["to"]["port"],
        }
        flat_wires.append(nw)

    return flat_blocks, flat_wires
