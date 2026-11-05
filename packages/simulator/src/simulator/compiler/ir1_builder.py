"""IR-1 builder: ModelDocument → IR1Graph (BE-12/BE-31/BE-44)."""

from __future__ import annotations

from typing import Any

from simulator.compiler.converter_lower import validate_no_direct_cross_paradigm_wires
from simulator.compiler.gsim_sch_loader import ModelDocument
from simulator.compiler.subckt_lower import check_def_refs_resolve, check_no_cyclic_defs
from simulator.compiler.unit_table import UnknownUnitError, resolve_scale
from simulator.ir.ir1 import (
    IR1Block,
    IR1Connection,
    IR1Graph,
    IR1Net,
    IR1SimulationDirective,
    IR1SubcktDef,
    IR1SubcktInstance,
    IR1SubcktPort,
)

__all__ = [
    "UnknownUnitError",
    "UnsupportedBlockError",
    "build",
    "build_ir1",
]


class UnsupportedBlockError(ValueError):
    """Raised when a block type is explicitly not supported in the current version."""


# Block types that are deferred to v3 and must raise UnsupportedBlockError.
_V3_ONLY_BLOCK_TYPES: frozenset[str] = frozenset(
    {
        "signal-flow.attributes.data_type_conversion",
        "signal-flow.attributes.rate_transition",
    }
)


def build(doc: ModelDocument | dict[str, Any]) -> IR1Graph:
    """Build an IR1Graph from a validated model document.

    Supports both v2 ``ModelDocument`` and legacy dict payloads so existing
    callers/tests remain compatible.
    """
    model, resolved_params = _extract_model_and_params(doc)

    blocks: list[IR1Block] = []
    connections: list[IR1Connection] = []
    nets: list[IR1Net] = []

    for b in model.get("blocks", []):
        block_type = str(b["type"])
        if block_type in _V3_ONLY_BLOCK_TYPES:
            raise UnsupportedBlockError("v3 only")
        blocks.append(
            IR1Block(
                instance_id=b["id"],
                block_type=block_type,
                paradigm=str(b.get("paradigm") or _infer_paradigm(block_type)),
                domain=str(b.get("domain") or _infer_domain(block_type)),
                fidelity=str(b.get("fidelity", "n_a")),
                params=dict(b.get("params", {})),
                ic=dict(b.get("ic", {})),
            )
        )

    for wire in model.get("wires", []):
        src_block = wire["from"]["block"]
        src_port = wire["from"]["port"]
        dst_block = wire["to"]["block"]
        dst_port = wire["to"]["port"]
        connections.append(
            IR1Connection(
                src=(src_block, src_port),
                dst=(dst_block, dst_port),
                kind=str(wire.get("kind", "signal")),
                net=wire.get("net"),
            )
        )

    for net in model.get("nets", []):
        nets.append(
            IR1Net(
                name=net["name"],
                kind=net["kind"],
                scope=net["scope"],
                is_reference=bool(net.get("is_reference", False)),
            )
        )

    simulation = _build_simulation(model.get("simulation", {}))
    subckt_defs = _build_subckt_defs(model.get("subckt_defs", []))

    graph = IR1Graph(
        blocks=blocks,
        connections=connections,
        params=resolved_params,
        nets=nets,
        simulation=simulation,
        subckt_defs=subckt_defs,
    )
    validate_no_direct_cross_paradigm_wires(graph)
    _validate_and_lower_signal_attribute_blocks(graph)
    _validate_subckt_refs(graph)
    return graph


def _build_subckt_defs(raw_defs: list[dict[str, Any]]) -> list[IR1SubcktDef]:
    defs: list[IR1SubcktDef] = []
    for d in raw_defs:
        ports = [
            IR1SubcktPort(id=p["id"], kind=p["kind"]) for p in d.get("ports", [])
        ]
        instances = [
            IR1SubcktInstance(
                id=inst["id"],
                def_ref=inst["def_ref"],
                connections=list(inst.get("connections", [])),
                params=dict(inst.get("params", {})),
            )
            for inst in d.get("instances", [])
        ]
        defs.append(
            IR1SubcktDef(
                id=d["id"],
                name=d["name"],
                ports=ports,
                params=list(d.get("params", [])),
                instances=instances,
                body=str(d.get("body", "")),
            )
        )
    return defs


def _validate_subckt_refs(graph: IR1Graph) -> None:
    check_no_cyclic_defs(graph.subckt_defs)
    block_def_refs = [
        (b.instance_id, str(b.params["def_ref"]))
        for b in graph.blocks
        if b.paradigm == "spice-subckt" and "def_ref" in b.params
    ]
    check_def_refs_resolve(graph.subckt_defs, block_def_refs)


def _validate_and_lower_signal_attribute_blocks(graph: IR1Graph) -> None:
    """Validate signal-attribute blocks and inject derived params.

    For ``signal-flow.attributes.unit_conversion`` blocks:
    - Resolves ``from_unit`` and ``to_unit`` via the unit table.
    - Injects the computed ``scale`` into the block's params dict.
    - Raises ``UnknownUnitError`` if either unit string is unknown.
    """
    for block in graph.blocks:
        if block.block_type == "signal-flow.attributes.unit_conversion":
            from_unit = str(block.params.get("from_unit", ""))
            to_unit = str(block.params.get("to_unit", ""))
            # resolve_scale raises UnknownUnitError on bad unit strings.
            scale = resolve_scale(from_unit, to_unit)
            block.params["scale"] = scale


def _extract_model_and_params(
    doc: ModelDocument | dict[str, Any],
) -> tuple[dict[str, Any], dict[str, float]]:
    if isinstance(doc, ModelDocument):
        return doc.model, dict(doc.resolved_params)

    model = dict(doc.get("model", {}))
    params: dict[str, float] = {}
    for entry in model.get("params", []):
        name = entry.get("name")
        value = entry.get("value")
        if isinstance(name, str) and isinstance(value, int | float) and not isinstance(value, bool):
            params[name] = float(value)
    return model, params


def _build_simulation(raw: Any) -> IR1SimulationDirective:
    if not isinstance(raw, dict):
        return IR1SimulationDirective()
    return IR1SimulationDirective(
        analyses=list(raw.get("analyses", [])),
        solver=dict(raw.get("solver", {})),
        initial_conditions=list(raw.get("initial_conditions", [])),
        output=dict(raw.get("output", {})),
        default_analysis=str(raw.get("default_analysis", "")),
    )


def _infer_paradigm(block_type: str) -> str:
    if block_type.startswith("signal-flow."):
        return "signal-flow"
    if block_type.startswith(
        (
            "physical-electrical.",
            "physical-translational.",
            "physical-rotational.",
            "physical-thermal.",
        )
    ):
        return "physical-network"
    if block_type.startswith("converter."):
        return "converter"
    if block_type.startswith("hierarchy."):
        return "hierarchy"
    if block_type.startswith("routing."):
        return "routing"
    if block_type.startswith("annotation."):
        return "annotation"
    if block_type.startswith("spice-subckt."):
        return "spice-subckt"
    # Legacy/default fallback.
    return "signal-flow"


def _infer_domain(block_type: str) -> str:
    if block_type.startswith("physical-electrical."):
        return "physical-electrical"
    if block_type.startswith("physical-translational."):
        return "physical-translational"
    if block_type.startswith("physical-rotational."):
        return "physical-rotational"
    if block_type.startswith("physical-thermal."):
        return "physical-thermal"
    return "signal"


build_ir1 = build
