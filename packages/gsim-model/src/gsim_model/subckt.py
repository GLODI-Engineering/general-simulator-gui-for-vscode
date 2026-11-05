"""SubcktPort / SubcktInstance / SubcktDef — opaque-but-readable SPICE
subcircuit definitions, reusable across many spice-subckt.* block instances
via def_ref (true .SUBCKT/X-card reuse, not per-instance text duplication).
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field, model_validator

from gsim_model.types import ParamEntry, ParamValue

_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")

# Acausal physical-network kinds only — no signal, no physical-signal (that's
# a converter bus type, not a real SPICE net kind).
SubcktPortKind = str  # narrowed by _PHYSICAL_NETWORK_KINDS at validation time
_PHYSICAL_NETWORK_KINDS = frozenset(
    {
        "physical-electrical",
        "physical-translational",
        "physical-rotational",
        "physical-thermal",
    }
)


class SubcktPort(BaseModel):
    id: str
    kind: str

    @model_validator(mode="after")
    def _check_kind(self) -> SubcktPort:
        if self.kind not in _PHYSICAL_NETWORK_KINDS:
            raise ValueError(
                f"SubcktPort.kind {self.kind!r} must be one of {sorted(_PHYSICAL_NETWORK_KINDS)}"
            )
        return self


class SubcktInstance(BaseModel):
    """A structured X-card: instantiates another SubcktDef by id, letting one
    SubcktDef nest others the way real SPICE subckts nest other subckts."""

    id: str
    def_ref: str
    connections: list[str] = Field(default_factory=list)
    params: dict[str, ParamValue] = Field(default_factory=dict)


class SubcktDef(BaseModel):
    """Emitted once as ``.SUBCKT <name> <ports...> ... .ENDS``; referenced by
    many spice-subckt.* Block instances via params.def_ref. ``body`` is raw
    SPICE element-card text — readable verbatim (e.g. by an AI) but not
    decomposed into blocks/wires; ``instances`` structurally composes other
    SubcktDefs."""

    id: str
    name: str
    ports: list[SubcktPort] = Field(default_factory=list)
    params: list[ParamEntry] = Field(default_factory=list)
    instances: list[SubcktInstance] = Field(default_factory=list)
    body: str = ""

    @model_validator(mode="after")
    def _check_id(self) -> SubcktDef:
        if not _ID_PATTERN.match(self.id):
            raise ValueError(f"SubcktDef.id {self.id!r} does not match ^[A-Za-z][A-Za-z0-9_-]*$")
        return self


class CyclicSubcktDefError(ValueError):
    """Raised when a SubcktDef's instances (transitively, via def_ref)
    reference their own id."""


def check_no_cyclic_defs(defs: list[SubcktDef]) -> None:
    """Fail-fast check mirroring CrossParadigmWireError's build-time style:
    a def_ref graph must be acyclic before any netlist is written."""
    by_id = {d.id: d for d in defs}
    white, gray, black = 0, 1, 2
    color: dict[str, int] = dict.fromkeys(by_id, white)

    def visit(def_id: str, chain: list[str]) -> None:
        if def_id not in by_id:
            return  # dangling def_ref is a separate (schema-level) concern
        if color[def_id] == black:
            return
        if color[def_id] == gray:
            cycle = " -> ".join([*chain, def_id])
            raise CyclicSubcktDefError(f"Cyclic SubcktDef reference: {cycle}")
        color[def_id] = gray
        for inst in by_id[def_id].instances:
            visit(inst.def_ref, [*chain, def_id])
        color[def_id] = black

    for def_id in by_id:
        if color[def_id] == white:
            visit(def_id, [])
