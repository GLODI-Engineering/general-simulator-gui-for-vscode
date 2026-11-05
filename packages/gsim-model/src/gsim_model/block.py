"""Block / SubsystemModel — the node types of a .gsim_sch v2 document."""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

from gsim_model.subckt import SubcktDef
from gsim_model.types import Fidelity, Mirror, Paradigm, ParamEntry, ParamValue, PortKind, Rotation
from gsim_model.wire import Wire

_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$")


class SubsystemPort(BaseModel):
    id: str
    direction: str  # "in" | "out"
    kind: PortKind
    boundary_block: str


class ParamAlias(BaseModel):
    child: str
    parent: str


class Annotation(BaseModel):
    id: str
    kind: str
    position: tuple[int, int] | None = None
    size: tuple[int, int] | None = None
    rotation: Rotation | None = None
    text: str | None = None
    points: list[tuple[int, int]] | None = None
    style: dict[str, object] | None = None


class NetEntry(BaseModel):
    name: str
    kind: PortKind
    scope: str  # "global" | "local"
    is_reference: bool | None = None


class Block(BaseModel):
    """A single instance on the canvas.

    Note: ``paradigm``/``domain``/``fidelity`` are required by the schema and
    are *not* auto-inferred here — the real catalog's block-type prefixes
    (e.g. ``physical_electrical.*``) don't actually match the JSON schema's
    paradigm-inference regex (``physical-electrical\\.``, hyphenated), so
    guessing would be unreliable. Pass them explicitly.
    """

    id: str
    type: str
    paradigm: Paradigm
    domain: PortKind
    fidelity: Fidelity
    position: tuple[int, int]
    rotation: Rotation = 0
    mirror: Mirror = "none"
    params: dict[str, ParamValue] = Field(default_factory=dict)
    ic: dict[str, ParamValue] = Field(default_factory=dict)
    label: str | None = None
    subsystem: SubsystemModel | None = None

    @model_validator(mode="after")
    def _validate_id_and_type(self) -> Block:
        if not _ID_PATTERN.match(self.id):
            raise ValueError(f"Block.id {self.id!r} does not match ^[A-Za-z][A-Za-z0-9_-]*$")
        if not _TYPE_PATTERN.match(self.type):
            raise ValueError(f"Block.type {self.type!r} is not a valid dotted type name")
        if self.paradigm == "spice-subckt" and self.subsystem is not None:
            raise ValueError(
                "A spice-subckt block references a SubcktDef via params.def_ref; "
                "it must not carry a graphical `subsystem` body."
            )
        return self


class SimulationDirective(BaseModel):
    """Loosely typed — see AGENTS-level docs for the full Analysis/Sweep
    shapes. Kept as a passthrough dict here since manipulation of analyses
    is out of scope for the connectivity/builder work; JSON Schema
    validation (via gsim_sch_loader) still catches malformed content on
    save/load.
    """

    model_config = ConfigDict(extra="allow")

    default_analysis: str | None = None
    analyses: list[dict[str, object]] = Field(default_factory=list)
    solver: dict[str, object] = Field(default_factory=dict)
    initial_conditions: list[dict[str, object]] = Field(default_factory=list)
    output: dict[str, object] = Field(default_factory=dict)


class SubsystemModel(BaseModel):
    id: str
    name: str
    grid: int = 10
    params: list[ParamEntry] = Field(default_factory=list)
    blocks: list[Block] = Field(default_factory=list)
    wires: list[Wire] = Field(default_factory=list)
    lines: list[Annotation] = Field(default_factory=list)
    nets: list[NetEntry] = Field(default_factory=list)
    simulation: SimulationDirective = Field(default_factory=SimulationDirective)
    metadata: dict[str, object] = Field(default_factory=dict)
    ports: list[SubsystemPort] = Field(default_factory=list)
    parent_param_aliases: list[ParamAlias] = Field(default_factory=list)
    subckt_defs: list[SubcktDef] = Field(default_factory=list)


# Resolve the forward reference Block.subsystem -> SubsystemModel.
Block.model_rebuild()
