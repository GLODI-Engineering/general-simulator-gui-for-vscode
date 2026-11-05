"""Model / GsimSchDocument — the top-level .gsim_sch v2 document, plus
load()/save() that round-trip through the real (byte-stable, canonically
ordered) simulator.compiler.gsim_sch_writer.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any, Literal

from pydantic import BaseModel, Field

from gsim_model.block import Annotation, Block, NetEntry, ParamEntry, SimulationDirective
from gsim_model.subckt import SubcktDef
from gsim_model.wire import Wire


class Model(BaseModel):
    id: str
    name: str
    #: Document role (spec §4.1). ``None`` means absent, which reads as
    #: ``"schematic"``; it is left absent on dump so pre-role files round-trip
    #: byte-exactly. ``"library"`` marks a stamp / subckt_defs carrier that
    #: tooling must not offer to simulate directly.
    role: Literal["schematic", "library"] | None = None
    grid: int = 10
    params: list[ParamEntry] = Field(default_factory=list)
    blocks: list[Block] = Field(default_factory=list)
    wires: list[Wire] = Field(default_factory=list)
    lines: list[Annotation] = Field(default_factory=list)
    nets: list[NetEntry] = Field(default_factory=list)
    simulation: SimulationDirective = Field(default_factory=SimulationDirective)
    metadata: dict[str, Any] = Field(default_factory=dict)
    subckt_defs: list[SubcktDef] = Field(default_factory=list)


class GsimSchDocument(BaseModel):
    schema_version: Literal[2] = 2
    model: Model

    # -- loading -------------------------------------------------------------

    @classmethod
    def load(cls, source: pathlib.Path | str | dict[str, Any]) -> GsimSchDocument:
        raw = _ingest(source)
        return cls.model_validate(raw)

    # -- saving ----------------------------------------------------------------

    def to_raw_dict(self) -> dict[str, Any]:
        """Dump to a plain dict matching the .gsim_sch v2 JSON shape
        (``from`` alias applied, no Python-only fields).

        Optional-but-non-nullable fields (e.g. Block.label) are omitted
        rather than emitted as ``null`` — the schema only allows ``null``
        for the handful of fields that declare ``oneOf: [type, null]``
        (currently just Wire.net / Wire.label), everything else must be
        absent-or-typed.
        """
        data = self.model_dump(mode="json", by_alias=True, exclude_none=True)
        for wire in data.get("model", {}).get("wires", []):
            wire.setdefault("net", None)
        return data

    def to_json(self) -> str:
        """Canonical, byte-stable JSON text via the real gsim_sch_writer."""
        from simulator.compiler.gsim_sch_loader import ModelDocument
        from simulator.compiler.gsim_sch_writer import write

        doc = ModelDocument(
            schema_version=self.schema_version,
            model=self.to_raw_dict()["model"],
            resolved_params={},
        )
        return str(write(doc))

    def save(self, path: pathlib.Path | str) -> None:
        pathlib.Path(path).write_text(self.to_json(), encoding="utf-8")


def _ingest(source: pathlib.Path | str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(source, dict):
        return source
    text = str(source)
    stripped = text.lstrip()
    if stripped.startswith("{"):
        return json.loads(text)  # type: ignore[no-any-return]
    with pathlib.Path(source).open("r", encoding="utf-8") as fh:
        return json.load(fh)  # type: ignore[no-any-return]
