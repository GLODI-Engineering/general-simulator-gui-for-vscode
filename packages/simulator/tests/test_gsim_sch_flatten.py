"""Tests for gsim_sch_flatten — BE-32.

Covers every acceptance bullet from progress.backend.yaml:

    test_flatten_atomic        — depth-2 atomic subsystem, namespaced ids +
                                 execution_kind tags.
    test_flatten_virtual       — virtual subsystem, no execution_kind, ids
                                 still namespaced.
    test_flatten_boundary_wires— parent→inport→inner-block becomes a direct
                                 parent→inner-block wire.
    test_flatten_param_alias   — Kp aliased from parent's Kp_outer resolves
                                 on an inner block's param.
    test_flatten_id_clash      — duplicate flat ids raise FlattenError.
    test_flatten_enabled       — inner blocks carry execution_kind='enabled'
                                 and a consistent enable_signal reference.
    test_flatten_triggered     — inner blocks carry execution_kind='triggered',
                                 trigger_signal, and trigger_kind.
    test_flatten_unsupported_iterator — raises UnsupportedSubsystemError.
"""

from __future__ import annotations

from typing import Any

import pytest

from simulator.compiler.gsim_sch_flatten import (
    FlattenError,
    UnsupportedSubsystemError,
    flatten,
)
from simulator.compiler.gsim_sch_loader import ModelDocument

# ---------------------------------------------------------------------------
# Helpers
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
    b: dict[str, Any] = {
        "id": block_id,
        "type": block_type,
        "position": [0, 0],
        "params": params or {},
    }
    return b


def _doc(
    blocks: list[dict[str, Any]],
    wires: list[dict[str, Any]] | None = None,
    resolved_params: dict[str, float] | None = None,
) -> ModelDocument:
    """Construct a minimal ModelDocument without running the full loader."""
    return ModelDocument(
        schema_version=2,
        model={
            "id": "test-model",
            "label": "Test",
            "blocks": blocks,
            "wires": wires or [],
            "params": [],
        },
        resolved_params=resolved_params or {},
    )


def _inport(block_id: str) -> dict[str, Any]:
    return {"id": block_id, "type": "hierarchy.inport", "position": [0, 0], "params": {}}


def _outport(block_id: str) -> dict[str, Any]:
    return {"id": block_id, "type": "hierarchy.outport", "position": [0, 0], "params": {}}


def _port_def(
    port_id: str,
    boundary_block: str,
    direction: str,
    kind: str = "signal",
) -> dict[str, Any]:
    return {
        "id": port_id,
        "boundary_block": boundary_block,
        "direction": direction,
        "kind": kind,
    }


def _subsystem_block(
    block_id: str,
    variant: str,
    inner_blocks: list[dict[str, Any]],
    inner_wires: list[dict[str, Any]] | None = None,
    ports: list[dict[str, Any]] | None = None,
    parent_param_aliases: list[dict[str, Any]] | None = None,
    params: dict | None = None,
) -> dict[str, Any]:
    sub: dict[str, Any] = {
        "blocks": inner_blocks,
        "wires": inner_wires or [],
        "ports": ports or [],
    }
    if parent_param_aliases is not None:
        sub["parent_param_aliases"] = parent_param_aliases
    b: dict[str, Any] = {
        "id": block_id,
        "type": f"hierarchy.subsystem.{variant}",
        "position": [0, 0],
        "params": params or {},
        "subsystem": sub,
    }
    return b


# ---------------------------------------------------------------------------
# test_flatten_atomic
# ---------------------------------------------------------------------------


def test_flatten_atomic_namespaced_ids():
    """Depth-2 atomic subsystem: inner block ids must be namespaced."""
    inner = _leaf("gain1", "signal-flow.math.gain", params={"K": 1.0})
    subsys = _subsystem_block("ctrl1", "atomic", inner_blocks=[inner])
    result = flatten(_doc(blocks=[subsys]))

    ids = [b["id"] for b in result.model["blocks"]]
    assert "ctrl1/gain1" in ids, f"Expected 'ctrl1/gain1' in flat ids, got: {ids}"
    # Original un-namespaced id must not be present.
    assert "gain1" not in ids


def test_flatten_atomic_execution_kind_tag():
    """Every block inside an atomic subsystem carries execution_kind='atomic'."""
    inner_a = _leaf("a", "signal-flow.math.gain")
    inner_b = _leaf("b", "signal-flow.math.gain")
    subsys = _subsystem_block("ctrl1", "atomic", inner_blocks=[inner_a, inner_b])
    result = flatten(_doc(blocks=[subsys]))

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    for namespaced_id in ("ctrl1/a", "ctrl1/b"):
        block = flat_map[namespaced_id]
        exec_kind = block.get("metadata", {}).get("execution_kind")
        assert exec_kind == "atomic", (
            f"Expected execution_kind='atomic' on {namespaced_id}, got {exec_kind!r}"
        )


def test_flatten_atomic_depth2_nested():
    """Depth-2: atomic inside another atomic — ids are doubly namespaced."""
    deep_leaf = _leaf("integrator", "signal-flow.continuous.integrator")
    inner_atomic = _subsystem_block("inner", "atomic", inner_blocks=[deep_leaf])
    outer_atomic = _subsystem_block("outer", "atomic", inner_blocks=[inner_atomic])
    result = flatten(_doc(blocks=[outer_atomic]))

    ids = [b["id"] for b in result.model["blocks"]]
    assert "outer/inner/integrator" in ids, f"Expected doubly-namespaced id, got: {ids}"
    block = next(b for b in result.model["blocks"] if b["id"] == "outer/inner/integrator")
    assert block.get("metadata", {}).get("execution_kind") == "atomic"


# ---------------------------------------------------------------------------
# test_flatten_virtual
# ---------------------------------------------------------------------------


def test_flatten_virtual_no_execution_kind():
    """A virtual subsystem leaves no execution_kind hint on inner blocks."""
    inner = _leaf("sum1", "signal-flow.math.sum")
    subsys = _subsystem_block("virt1", "virtual", inner_blocks=[inner])
    result = flatten(_doc(blocks=[subsys]))

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    assert "virt1/sum1" in flat_map, "Inner block should be namespaced"
    block = flat_map["virt1/sum1"]
    exec_kind = block.get("metadata", {}).get("execution_kind")
    assert exec_kind is None, f"Virtual subsystem must not set execution_kind, got {exec_kind!r}"


def test_flatten_virtual_ids_are_still_namespaced():
    """Even though virtual has no semantic effect, ids are prefixed."""
    inner = _leaf("g", "signal-flow.math.gain")
    subsys = _subsystem_block("wrap", "virtual", inner_blocks=[inner])
    result = flatten(_doc(blocks=[subsys]))

    ids = [b["id"] for b in result.model["blocks"]]
    assert "wrap/g" in ids
    assert "g" not in ids


# ---------------------------------------------------------------------------
# test_flatten_boundary_wires
# ---------------------------------------------------------------------------


def test_flatten_boundary_wires_inport():
    """parent→inport→inner-block becomes a direct wire parent→inner-block."""
    # Outer level: source block + subsystem
    source = _leaf("src", "signal-flow.source.constant")
    inport_block = _inport("ip1")
    inner = _leaf("gain1", "signal-flow.math.gain")

    # Inner wire: inport → gain1
    inner_wire = _wire("iw1", "ip1", "out", "gain1", "in")

    # Port definition linking outer port "u" to boundary block "ip1"
    port = _port_def("u", "ip1", "in")

    subsys = _subsystem_block(
        "ctrl",
        "virtual",
        inner_blocks=[inport_block, inner],
        inner_wires=[inner_wire],
        ports=[port],
    )

    # Outer wire: source.out → ctrl.u
    outer_wire = _wire("ow1", "src", "out", "ctrl", "u")

    result = flatten(_doc(blocks=[source, subsys], wires=[outer_wire]))

    flat_wires = result.model["wires"]
    flat_blocks = result.model["blocks"]

    # source must still be present (un-namespaced at top level since prefix="")
    block_ids = [b["id"] for b in flat_blocks]
    assert "src" in block_ids, f"'src' must be in flat ids: {block_ids}"
    assert "ctrl/gain1" in block_ids, f"'ctrl/gain1' must be in flat ids: {block_ids}"

    # There must be a direct wire from src → ctrl/gain1
    direct = [
        w for w in flat_wires if w["from"]["block"] == "src" and w["to"]["block"] == "ctrl/gain1"
    ]
    assert direct, f"Expected a direct wire src→ctrl/gain1. Wires present: {flat_wires}"


def test_flatten_boundary_wires_outport():
    """inner-block→outport→parent becomes a direct wire inner-block→parent."""
    inner = _leaf("comp", "signal-flow.math.gain")
    outport_block = _outport("op1")
    sink = _leaf("sink", "signal-flow.sink.scope")

    inner_wire = _wire("iw2", "comp", "out", "op1", "in")
    port = _port_def("y", "op1", "out")

    subsys = _subsystem_block(
        "sys1",
        "virtual",
        inner_blocks=[inner, outport_block],
        inner_wires=[inner_wire],
        ports=[port],
    )

    outer_wire = _wire("ow2", "sys1", "y", "sink", "in")

    result = flatten(_doc(blocks=[subsys, sink], wires=[outer_wire]))

    flat_wires = result.model["wires"]
    direct = [
        w for w in flat_wires if w["from"]["block"] == "sys1/comp" and w["to"]["block"] == "sink"
    ]
    assert direct, f"Expected direct wire sys1/comp→sink. Wires: {flat_wires}"


# ---------------------------------------------------------------------------
# test_flatten_param_alias
# ---------------------------------------------------------------------------


def test_flatten_param_alias_resolves_to_parent_value():
    """Subsystem aliasing child 'Kp' → parent 'Kp_outer' resolves the block param."""
    inner = _leaf("gain1", "signal-flow.math.gain", params={"K": "Kp"})
    aliases = [{"child": "Kp", "parent": "Kp_outer"}]
    subsys = _subsystem_block(
        "ctrl",
        "virtual",
        inner_blocks=[inner],
        parent_param_aliases=aliases,
    )
    doc = _doc(blocks=[subsys], resolved_params={"Kp_outer": 500.0})
    result = flatten(doc)

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    block = flat_map["ctrl/gain1"]
    assert block["params"]["K"] == 500.0, (
        f"Expected K=500.0 after alias resolution, got {block['params']['K']!r}"
    )


def test_flatten_param_alias_unaliased_param_unchanged():
    """A param with no alias mapping is carried through unchanged."""
    inner = _leaf("gain1", "signal-flow.math.gain", params={"K": "some_expr", "bias": 1.0})
    aliases = [{"child": "Kp", "parent": "Kp_outer"}]
    subsys = _subsystem_block(
        "ctrl",
        "virtual",
        inner_blocks=[inner],
        parent_param_aliases=aliases,
    )
    doc = _doc(blocks=[subsys], resolved_params={"Kp_outer": 500.0})
    result = flatten(doc)

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    block = flat_map["ctrl/gain1"]
    # "some_expr" doesn't match any alias → stays as-is
    assert block["params"]["K"] == "some_expr"
    assert block["params"]["bias"] == 1.0


# ---------------------------------------------------------------------------
# test_flatten_id_clash
# ---------------------------------------------------------------------------


def test_flatten_id_clash_raises_flatten_error():
    """Two blocks whose flat ids collide raise FlattenError."""
    # A virtual subsystem "sub" containing leaf "item",
    # producing flat id "sub/item".
    # A top-level leaf block whose id is already "sub/item".
    # Both end up with id "sub/item" → clash.
    inner = _leaf("item", "signal-flow.math.gain")
    subsys = _subsystem_block("sub", "virtual", inner_blocks=[inner])
    # Note: "/" in block id is unusual but the flattener doesn't validate it;
    # it only checks uniqueness in the final flat list.
    collider = _leaf("sub/item", "signal-flow.math.gain")

    with pytest.raises(FlattenError, match="sub/item"):
        flatten(_doc(blocks=[subsys, collider]))


def test_flatten_id_clash_two_identical_top_level_ids():
    """Two top-level leaf blocks with the same id raise FlattenError."""
    block_a = _leaf("dup", "signal-flow.math.gain")
    block_b = _leaf("dup", "signal-flow.math.sum")

    with pytest.raises(FlattenError, match="dup"):
        flatten(_doc(blocks=[block_a, block_b]))


# ---------------------------------------------------------------------------
# test_flatten_enabled
# ---------------------------------------------------------------------------


def test_flatten_enabled_execution_kind():
    """Every block inside an .enabled subsystem carries execution_kind='enabled'."""
    ctrl = _leaf("ctrl", "signal-flow.source.constant")
    inner_a = _leaf("a", "signal-flow.math.gain")
    inner_b = _leaf("b", "signal-flow.continuous.integrator")

    subsys = _subsystem_block("sys_en", "enabled", inner_blocks=[inner_a, inner_b])

    # Wire: ctrl.out → sys_en.enable
    enable_wire = _wire("ew1", "ctrl", "out", "sys_en", "enable")

    result = flatten(_doc(blocks=[ctrl, subsys], wires=[enable_wire]))

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    for namespaced_id in ("sys_en/a", "sys_en/b"):
        block = flat_map[namespaced_id]
        md = block.get("metadata", {})
        assert md.get("execution_kind") == "enabled", (
            f"{namespaced_id}: expected execution_kind='enabled', got {md!r}"
        )


def test_flatten_enabled_consistent_enable_signal():
    """All inner blocks share the same enable_signal reference."""
    ctrl = _leaf("ctrl", "signal-flow.source.constant")
    inner_a = _leaf("a", "signal-flow.math.gain")
    inner_b = _leaf("b", "signal-flow.math.gain")

    subsys = _subsystem_block("sys_en", "enabled", inner_blocks=[inner_a, inner_b])
    enable_wire = _wire("ew1", "ctrl", "out", "sys_en", "enable")

    result = flatten(_doc(blocks=[ctrl, subsys], wires=[enable_wire]))

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    signals = [
        flat_map[nid].get("metadata", {}).get("enable_signal") for nid in ("sys_en/a", "sys_en/b")
    ]

    # All signals must be non-None and identical.
    assert all(s is not None for s in signals), (
        f"enable_signal must be set on every inner block: {signals}"
    )
    assert signals[0] == signals[1], (
        f"All inner blocks must share the same enable_signal: {signals}"
    )
    # The enable_signal must point to the ctrl block
    assert signals[0]["block"] == "ctrl", f"enable_signal.block must be 'ctrl', got {signals[0]!r}"
    assert signals[0]["port"] == "out", f"enable_signal.port must be 'out', got {signals[0]!r}"


# ---------------------------------------------------------------------------
# test_flatten_triggered
# ---------------------------------------------------------------------------


def test_flatten_triggered_execution_kind_and_signal():
    """Inner blocks of .triggered subsystem carry execution_kind, trigger_signal."""
    trigger_src = _leaf("clk", "signal-flow.source.pulse")
    inner = _leaf("integ", "signal-flow.continuous.integrator")

    subsys = _subsystem_block(
        "sys_tr",
        "triggered",
        inner_blocks=[inner],
        params={"trigger_kind": "rising"},
    )
    trig_wire = _wire("tw1", "clk", "out", "sys_tr", "trigger")

    result = flatten(_doc(blocks=[trigger_src, subsys], wires=[trig_wire]))

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    block = flat_map["sys_tr/integ"]
    md = block.get("metadata", {})

    assert md.get("execution_kind") == "triggered", (
        f"Expected execution_kind='triggered', got {md!r}"
    )
    assert md.get("trigger_signal") is not None, "trigger_signal must be set"
    assert md["trigger_signal"]["block"] == "clk"
    assert md["trigger_signal"]["port"] == "out"


@pytest.mark.parametrize("trigger_kind", ["rising", "falling", "either"])
def test_flatten_triggered_trigger_kind_values(trigger_kind: str):
    """trigger_kind is recorded correctly for each allowed variant."""
    clk = _leaf("clk", "signal-flow.source.pulse")
    inner = _leaf("latch", "signal-flow.math.gain")

    subsys = _subsystem_block(
        "sys_tr",
        "triggered",
        inner_blocks=[inner],
        params={"trigger_kind": trigger_kind},
    )
    trig_wire = _wire("tw1", "clk", "out", "sys_tr", "trigger")

    result = flatten(_doc(blocks=[clk, subsys], wires=[trig_wire]))

    flat_map = {b["id"]: b for b in result.model["blocks"]}
    block = flat_map["sys_tr/latch"]
    recorded = block.get("metadata", {}).get("trigger_kind")
    assert recorded == trigger_kind, f"Expected trigger_kind={trigger_kind!r}, got {recorded!r}"


# ---------------------------------------------------------------------------
# test_flatten_unsupported_iterator
# ---------------------------------------------------------------------------


def test_flatten_unsupported_iterator_raises():
    """A hierarchy.subsystem.iterator raises UnsupportedSubsystemError."""
    inner = _leaf("elem", "signal-flow.math.gain")
    subsys = _subsystem_block("iter1", "iterator", inner_blocks=[inner])

    with pytest.raises(UnsupportedSubsystemError):
        flatten(_doc(blocks=[subsys]))


def test_flatten_unsupported_iterator_error_message():
    """The error message names the offending type."""
    inner = _leaf("elem", "signal-flow.math.gain")
    subsys = _subsystem_block("iter1", "iterator", inner_blocks=[inner])

    with pytest.raises(UnsupportedSubsystemError, match="iterator"):
        flatten(_doc(blocks=[subsys]))


# ---------------------------------------------------------------------------
# Additional robustness tests
# ---------------------------------------------------------------------------


def test_flatten_empty_model():
    """An empty model (no blocks, no wires) flattens to an empty flat doc."""
    result = flatten(_doc(blocks=[]))
    assert result.model["blocks"] == []
    assert result.model["wires"] == []


def test_flatten_preserves_resolved_params():
    """resolved_params from the input doc are carried over unchanged."""
    block = _leaf("g", "signal-flow.math.gain")
    doc = _doc(blocks=[block], resolved_params={"R": 100.0, "C": 1e-6})
    result = flatten(doc)
    assert result.resolved_params == {"R": 100.0, "C": 1e-6}


def test_flatten_preserves_schema_version():
    """schema_version from the input doc is preserved."""
    block = _leaf("g", "signal-flow.math.gain")
    doc = _doc(blocks=[block])
    result = flatten(doc)
    assert result.schema_version == 2


def test_flatten_top_level_leaf_blocks_are_namespaced_with_empty_prefix():
    """Top-level leaf blocks keep their original ids (empty prefix → no prefix)."""
    b1 = _leaf("blockA", "signal-flow.math.gain")
    b2 = _leaf("blockB", "signal-flow.math.sum")
    result = flatten(_doc(blocks=[b1, b2]))
    ids = [b["id"] for b in result.model["blocks"]]
    assert "blockA" in ids
    assert "blockB" in ids


def test_flatten_inport_outport_removed_from_flat_blocks():
    """hierarchy.inport and hierarchy.outport blocks don't appear in flat output."""
    ip = _inport("ip")
    op = _outport("op")
    inner = _leaf("gain", "signal-flow.math.gain")
    subsys = _subsystem_block("sys", "virtual", inner_blocks=[ip, op, inner])
    result = flatten(_doc(blocks=[subsys]))

    types = {b["type"] for b in result.model["blocks"]}
    assert "hierarchy.inport" not in types
    assert "hierarchy.outport" not in types


def test_flatten_virtual_nested_in_atomic_inherits_execution_kind():
    """A virtual subsystem nested inside an atomic subsystem:
    inner blocks still carry execution_kind='atomic' from the outer context."""
    deep_leaf = _leaf("leaf", "signal-flow.math.gain")
    virtual_inner = _subsystem_block("virt", "virtual", inner_blocks=[deep_leaf])
    outer_atomic = _subsystem_block("atom", "atomic", inner_blocks=[virtual_inner])

    result = flatten(_doc(blocks=[outer_atomic]))
    flat_map = {b["id"]: b for b in result.model["blocks"]}

    # The deep leaf ends up at "atom/virt/leaf"
    assert "atom/virt/leaf" in flat_map, f"Expected 'atom/virt/leaf' in flat ids: {list(flat_map)}"
    exec_kind = flat_map["atom/virt/leaf"].get("metadata", {}).get("execution_kind")
    assert exec_kind == "atomic", (
        f"Expected execution_kind='atomic' propagated from outer atomic, got {exec_kind!r}"
    )
