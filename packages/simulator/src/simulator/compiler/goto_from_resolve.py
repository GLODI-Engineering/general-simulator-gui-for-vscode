"""gsim_sch Goto/From resolution pass (BE-33).

After flattening, resolves every ``routing.from`` block to exactly one visible
``routing.goto`` with the same tag (and port-kind partition), removes both
routing blocks, and rewires direct signal wires from the Goto input source(s)
to the From downstream target(s).
"""

from __future__ import annotations

import copy
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from simulator.compiler.gsim_sch_loader import ModelDocument

logger = logging.getLogger(__name__)


class UnresolvedTagError(ValueError):
    """Raised when a From tag cannot be resolved to any visible Goto."""

    def __init__(self, tag: str, from_id: str) -> None:
        super().__init__(f"Unresolved From tag {tag!r} for block {from_id!r}")
        self.tag = tag
        self.from_id = from_id


class AmbiguousTagError(ValueError):
    """Raised when a From tag resolves to multiple visible Gotos."""

    def __init__(self, tag: str, from_id: str, candidate_goto_ids: list[str]) -> None:
        super().__init__(
            f"Ambiguous From tag {tag!r} for block {from_id!r}; candidates={candidate_goto_ids!r}"
        )
        self.tag = tag
        self.from_id = from_id
        self.candidate_goto_ids = candidate_goto_ids


@dataclass
class _GotoRecord:
    block: dict[str, Any]
    tag: str
    visibility: str
    subsystem_path: str
    kind: str
    incoming_wires: list[dict[str, Any]]
    matched_from_count: int = 0


def resolve_goto_from(doc: ModelDocument) -> ModelDocument:
    """Resolve routing.goto / routing.from blocks into direct wires.

    The returned model contains no routing blocks of either type.
    """
    model = copy.deepcopy(doc.model)
    blocks: list[dict[str, Any]] = model.get("blocks", [])
    wires: list[dict[str, Any]] = model.get("wires", [])

    incoming_by_block = _incoming_by_block(wires)
    outgoing_by_block = _outgoing_by_block(wires)

    goto_records: list[_GotoRecord] = []
    from_blocks: list[dict[str, Any]] = []
    keep_blocks: list[dict[str, Any]] = []

    for block in blocks:
        btype = str(block.get("type", ""))
        if btype == "routing.goto":
            bid = str(block.get("id", ""))
            params = _params(block)
            goto_records.append(
                _GotoRecord(
                    block=block,
                    tag=str(params.get("tag", "")),
                    visibility=str(params.get("visibility", "local")),
                    subsystem_path=_subsystem_path(bid),
                    kind=_infer_kind(incoming_by_block.get(bid, []), default="signal"),
                    incoming_wires=incoming_by_block.get(bid, []),
                )
            )
            continue
        if btype == "routing.from":
            from_blocks.append(block)
            continue
        keep_blocks.append(block)

    gotos_by_tag_kind: dict[tuple[str, str], list[_GotoRecord]] = {}
    for rec in goto_records:
        gotos_by_tag_kind.setdefault((rec.tag, rec.kind), []).append(rec)

    bridge_wires: list[dict[str, Any]] = []

    for from_block in from_blocks:
        from_id = str(from_block.get("id", ""))
        from_tag = str(_params(from_block).get("tag", ""))
        from_subsystem = _subsystem_path(from_id)
        from_out = outgoing_by_block.get(from_id, [])
        from_kind = _infer_kind(from_out, default="signal")

        visible = [
            rec
            for rec in gotos_by_tag_kind.get((from_tag, from_kind), [])
            if _is_visible(
                visibility=rec.visibility,
                goto_subsystem=rec.subsystem_path,
                from_subsystem=from_subsystem,
            )
        ]

        if not visible:
            raise UnresolvedTagError(from_tag, from_id)
        if len(visible) >= 2:
            raise AmbiguousTagError(
                from_tag,
                from_id,
                sorted(str(rec.block.get("id", "")) for rec in visible),
            )

        resolved_goto = visible[0]
        resolved_goto.matched_from_count += 1

        for g_in in resolved_goto.incoming_wires:
            for f_out in from_out:
                bridge_wires.append(_bridge_wire(g_in, f_out))

    # Keep wires that do not touch a removed routing block.
    removed_ids = {
        str(block.get("id", ""))
        for block in blocks
        if str(block.get("type", "")) in {"routing.goto", "routing.from"}
    }
    keep_wires = [
        wire
        for wire in wires
        if str(wire.get("from", {}).get("block", "")) not in removed_ids
        and str(wire.get("to", {}).get("block", "")) not in removed_ids
    ]

    # Unmatched Goto: allowed; add terminator-style sink so incoming signal
    # remains represented in the graph.
    existing_ids = {str(block.get("id", "")) for block in keep_blocks}
    terminator_blocks: list[dict[str, Any]] = []
    terminator_wires: list[dict[str, Any]] = []

    for rec in goto_records:
        if rec.matched_from_count > 0:
            continue
        goto_id = str(rec.block.get("id", ""))
        logger.info("Unmatched Goto tag=%r goto_id=%r", rec.tag, goto_id)

        if not rec.incoming_wires:
            continue

        sink_id = _unique_id(f"{goto_id}__unmatched_sink", existing_ids)
        existing_ids.add(sink_id)
        terminator_blocks.append(_terminator_block(sink_id))

        for g_in in rec.incoming_wires:
            terminator_wires.append(_wire_to_sink(g_in, sink_id))

    new_model = {
        **model,
        "blocks": keep_blocks + terminator_blocks,
        "wires": keep_wires + bridge_wires + terminator_wires,
    }

    return ModelDocument(
        schema_version=doc.schema_version,
        model=new_model,
        resolved_params=doc.resolved_params,
    )


def _params(block: dict[str, Any]) -> dict[str, Any]:
    params = block.get("params", {})
    if isinstance(params, dict):
        return params
    return {}


def _subsystem_path(block_id: str) -> str:
    if "/" not in block_id:
        return ""
    return block_id.rsplit("/", 1)[0]


def _incoming_by_block(wires: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for wire in wires:
        to = wire.get("to", {})
        block_id = str(to.get("block", ""))
        out.setdefault(block_id, []).append(wire)
    return out


def _outgoing_by_block(wires: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for wire in wires:
        frm = wire.get("from", {})
        block_id = str(frm.get("block", ""))
        out.setdefault(block_id, []).append(wire)
    return out


def _infer_kind(wires: list[dict[str, Any]], default: str) -> str:
    for wire in wires:
        kind = wire.get("kind")
        if isinstance(kind, str) and kind:
            return kind
    return default


def _is_visible(visibility: str, goto_subsystem: str, from_subsystem: str) -> bool:
    if visibility == "global":
        return True
    if visibility == "local":
        return goto_subsystem == from_subsystem
    # scoped
    if visibility != "scoped":
        return False
    if goto_subsystem == "":
        return True
    return from_subsystem == goto_subsystem or from_subsystem.startswith(f"{goto_subsystem}/")


def _bridge_wire(goto_in_wire: dict[str, Any], from_out_wire: dict[str, Any]) -> dict[str, Any]:
    from_ep = goto_in_wire.get("from", {})
    to_ep = from_out_wire.get("to", {})

    bridge_kind = from_out_wire.get("kind") or goto_in_wire.get("kind") or "signal"
    bridge_net = from_out_wire.get("net")
    if bridge_net is None:
        bridge_net = goto_in_wire.get("net")

    return {
        "id": f"_goto_from_{uuid.uuid4().hex[:8]}",
        "from": {
            "block": str(from_ep.get("block", "")),
            "port": str(from_ep.get("port", "")),
        },
        "to": {
            "block": str(to_ep.get("block", "")),
            "port": str(to_ep.get("port", "")),
        },
        "waypoints": [],
        "pinned": False,
        "net": bridge_net,
        "kind": bridge_kind,
        "label": None,
    }


def _terminator_block(block_id: str) -> dict[str, Any]:
    return {
        "id": block_id,
        "type": "routing.unmatched_sink",
        "position": [0, 0],
        "params": {},
        "ic": {},
    }


def _wire_to_sink(goto_in_wire: dict[str, Any], sink_id: str) -> dict[str, Any]:
    from_ep = goto_in_wire.get("from", {})
    return {
        "id": f"_goto_sink_{uuid.uuid4().hex[:8]}",
        "from": {
            "block": str(from_ep.get("block", "")),
            "port": str(from_ep.get("port", "")),
        },
        "to": {
            "block": sink_id,
            "port": "in",
        },
        "waypoints": [],
        "pinned": False,
        "net": goto_in_wire.get("net"),
        "kind": goto_in_wire.get("kind") or "signal",
        "label": None,
    }


def _unique_id(base: str, existing: set[str]) -> str:
    if base not in existing:
        return base
    i = 1
    while True:
        candidate = f"{base}_{i}"
        if candidate not in existing:
            return candidate
        i += 1
