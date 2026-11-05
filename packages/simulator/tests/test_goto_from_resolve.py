"""Tests for goto_from_resolve — BE-33."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from simulator.compiler.goto_from_resolve import (
    AmbiguousTagError,
    UnresolvedTagError,
    resolve_goto_from,
)
from simulator.compiler.gsim_sch_loader import ModelDocument

# ---------------------------------------------------------------------------
# Helpers (mostly reused from test_gsim_sch_flatten)
# ---------------------------------------------------------------------------


def _wire(
    wire_id: str,
    src_block: str,
    src_port: str,
    dst_block: str,
    dst_port: str,
    kind: str = "signal",
) -> dict[str, Any]:
    return {
        "id": wire_id,
        "from": {"block": src_block, "port": src_port},
        "to": {"block": dst_block, "port": dst_port},
        "waypoints": [],
        "pinned": False,
        "net": None,
        "kind": kind,
        "label": None,
    }


def _leaf(block_id: str, block_type: str, params: dict | None = None) -> dict[str, Any]:
    return {
        "id": block_id,
        "type": block_type,
        "position": [0, 0],
        "params": params or {},
    }


def _goto(block_id: str, tag: str, visibility: str = "local") -> dict[str, Any]:
    return _leaf(block_id, "routing.goto", params={"tag": tag, "visibility": visibility})


def _from(block_id: str, tag: str) -> dict[str, Any]:
    return _leaf(block_id, "routing.from", params={"tag": tag})


def _doc(
    blocks: list[dict[str, Any]],
    wires: list[dict[str, Any]] | None = None,
) -> ModelDocument:
    return ModelDocument(
        schema_version=2,
        model={
            "id": "test-model",
            "blocks": blocks,
            "wires": wires or [],
        },
        resolved_params={},
    )


# ---------------------------------------------------------------------------
# test_global_tag_resolves
# ---------------------------------------------------------------------------


def test_global_tag_resolves():
    """A global Goto and a From in different subsystems become a direct wire."""
    # A/src -> A/goto(tag=G, global)
    # B/from(tag=G) -> B/sink
    blocks = [
        _leaf("A/src", "signal-flow.source.constant"),
        _goto("A/goto", tag="G", visibility="global"),
        _from("B/from", tag="G"),
        _leaf("B/sink", "signal-flow.sink.scope"),
    ]
    wires = [
        _wire("w1", "A/src", "out", "A/goto", "in"),
        _wire("w2", "B/from", "out", "B/sink", "in"),
    ]

    result = resolve_goto_from(_doc(blocks, wires))

    # Routing blocks removed
    ids = {b["id"] for b in result.model["blocks"]}
    assert "A/goto" not in ids
    assert "B/from" not in ids
    assert "A/src" in ids
    assert "B/sink" in ids

    # Direct wire created
    bridge_wires = [
        w
        for w in result.model["wires"]
        if w["from"]["block"] == "A/src" and w["to"]["block"] == "B/sink"
    ]
    assert len(bridge_wires) == 1
    assert bridge_wires[0]["from"]["port"] == "out"
    assert bridge_wires[0]["to"]["port"] == "in"


# ---------------------------------------------------------------------------
# test_local_tag_invisible
# ---------------------------------------------------------------------------


def test_local_tag_invisible():
    """A local Goto in subsystem A and a From in subsystem B raise UnresolvedTagError."""
    blocks = [
        _leaf("A/src", "signal-flow.source.constant"),
        _goto("A/goto", tag="L", visibility="local"),
        _from("B/from", tag="L"),
        _leaf("B/sink", "signal-flow.sink.scope"),
    ]
    wires = [
        _wire("w1", "A/src", "out", "A/goto", "in"),
        _wire("w2", "B/from", "out", "B/sink", "in"),
    ]

    with pytest.raises(UnresolvedTagError) as excinfo:
        resolve_goto_from(_doc(blocks, wires))

    assert excinfo.value.tag == "L"
    assert excinfo.value.from_id == "B/from"


# ---------------------------------------------------------------------------
# test_scoped_tag_descendants
# ---------------------------------------------------------------------------


def test_scoped_tag_descendants():
    """A scoped Goto in subsystem A resolves to a From in A's nested child."""
    # A/src -> A/goto(tag=S, scoped)
    # A/B/from(tag=S) -> A/B/sink
    blocks = [
        _leaf("A/src", "signal-flow.source.constant"),
        _goto("A/goto", tag="S", visibility="scoped"),
        _from("A/B/from", tag="S"),
        _leaf("A/B/sink", "signal-flow.sink.scope"),
    ]
    wires = [
        _wire("w1", "A/src", "out", "A/goto", "in"),
        _wire("w2", "A/B/from", "out", "A/B/sink", "in"),
    ]

    result = resolve_goto_from(_doc(blocks, wires))

    # Direct wire created
    bridge_wires = [
        w
        for w in result.model["wires"]
        if w["from"]["block"] == "A/src" and w["to"]["block"] == "A/B/sink"
    ]
    assert len(bridge_wires) == 1


# ---------------------------------------------------------------------------
# test_ambiguous_global
# ---------------------------------------------------------------------------


def test_ambiguous_global():
    """Two global Gotos with the same tag and one From raise AmbiguousTagError."""
    blocks = [
        _leaf("A/src", "signal-flow.source.constant"),
        _goto("A/goto", tag="G", visibility="global"),
        _leaf("B/src", "signal-flow.source.constant"),
        _goto("B/goto", tag="G", visibility="global"),
        _from("C/from", tag="G"),
        _leaf("C/sink", "signal-flow.sink.scope"),
    ]
    wires = [
        _wire("w1", "A/src", "out", "A/goto", "in"),
        _wire("w2", "B/src", "out", "B/goto", "in"),
        _wire("w3", "C/from", "out", "C/sink", "in"),
    ]

    with pytest.raises(AmbiguousTagError) as excinfo:
        resolve_goto_from(_doc(blocks, wires))

    assert excinfo.value.tag == "G"
    assert excinfo.value.from_id == "C/from"
    assert sorted(excinfo.value.candidate_goto_ids) == ["A/goto", "B/goto"]


# ---------------------------------------------------------------------------
# test_unmatched_goto_warns
# ---------------------------------------------------------------------------


def test_unmatched_goto_warns(caplog):
    """A Goto with no From emits a warning/info but does not raise."""
    blocks = [
        _leaf("src", "signal-flow.source.constant"),
        _goto("goto", tag="U", visibility="global"),
    ]
    wires = [
        _wire("w1", "src", "out", "goto", "in"),
    ]

    with caplog.at_level(logging.INFO):
        result = resolve_goto_from(_doc(blocks, wires))

    assert "Unmatched Goto tag='U' goto_id='goto'" in caplog.text

    # The Goto is removed, and replaced with a terminator sink
    ids = {b["id"] for b in result.model["blocks"]}
    assert "goto" not in ids

    # Check if a sink was added
    sinks = [b for b in result.model["blocks"] if b["type"] == "routing.unmatched_sink"]
    assert len(sinks) == 1
    sink_id = sinks[0]["id"]

    # There should be a wire to this sink
    sink_wires = [w for w in result.model["wires"] if w["to"]["block"] == sink_id]
    assert len(sink_wires) == 1
    assert sink_wires[0]["from"]["block"] == "src"
