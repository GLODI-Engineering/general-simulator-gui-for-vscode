"""ModelBuilder — fluent, validating construction/mutation API over a
GsimSchDocument. This is the "pydantic-style manipulation" layer: every
call raises immediately (via pydantic validation) on a malformed block/wire
instead of deferring to a whole-document JSON Schema error at save time.
"""

from __future__ import annotations

import itertools
from typing import cast

from gsim_model.block import Block, ParamEntry
from gsim_model.document import GsimSchDocument, Model
from gsim_model.subckt import SubcktDef, SubcktInstance, SubcktPort, check_no_cyclic_defs
from gsim_model.types import Fidelity, Mirror, Paradigm, ParamValue, PortKind, Rotation
from gsim_model.wire import Endpoint, Wire


class BlockRef:
    """Handle returned by add_block(); use .port(id) to build Endpoints
    without re-typing the block id everywhere."""

    def __init__(self, builder: ModelBuilder, block_id: str) -> None:
        self._builder = builder
        self.id = block_id

    def port(self, port_id: str) -> Endpoint:
        return Endpoint(block=self.id, port=port_id)

    @property
    def block(self) -> Block:
        return self._builder.get_block(self.id)


class DanglingWireError(ValueError):
    """Raised when a wire endpoint refers to a block id that doesn't exist."""


class DuplicateIdError(ValueError):
    """Raised when a new block/wire id collides with an existing one."""


class UnknownSubcktDefError(KeyError):
    """Raised when instantiate_subckt() is given a def_ref with no matching
    SubcktDef in the document."""


class SubcktDefRef:
    """Handle returned by add_subckt_def(); pass .id as instantiate_subckt's
    def_ref."""

    def __init__(self, def_id: str) -> None:
        self.id = def_id


class ModelBuilder:
    """Wraps a GsimSchDocument and provides add/remove/connect operations
    that keep the document internally consistent (no dangling wires, no
    duplicate ids)."""

    def __init__(self, document: GsimSchDocument) -> None:
        self.document = document
        self._id_counters: dict[str, itertools.count] = {}

    @classmethod
    def new(cls, model_id: str, name: str, grid: int = 10) -> ModelBuilder:
        return cls(GsimSchDocument(model=Model(id=model_id, name=name, grid=grid)))

    @classmethod
    def from_document(cls, document: GsimSchDocument) -> ModelBuilder:
        return cls(document)

    # -- blocks ----------------------------------------------------------------

    def add_block(
        self,
        type: str,
        *,
        paradigm: Paradigm,
        domain: PortKind,
        fidelity: Fidelity = "ideal",
        position: tuple[int, int] = (0, 0),
        rotation: Rotation = 0,
        mirror: Mirror = "none",
        params: dict[str, ParamValue] | None = None,
        ic: dict[str, ParamValue] | None = None,
        label: str | None = None,
        id: str | None = None,
    ) -> BlockRef:
        block_id = id or self._auto_id(type)
        if any(b.id == block_id for b in self.document.model.blocks):
            raise DuplicateIdError(f"Block id {block_id!r} already exists")

        block = Block(
            id=block_id,
            type=type,
            paradigm=paradigm,
            domain=domain,
            fidelity=fidelity,
            position=position,
            rotation=rotation,
            mirror=mirror,
            params=params or {},
            ic=ic or {},
            label=label,
        )
        self.document.model.blocks.append(block)
        return BlockRef(self, block_id)

    def get_block(self, block_id: str) -> Block:
        for b in self.document.model.blocks:
            if b.id == block_id:
                return b
        raise KeyError(f"No block with id {block_id!r}")

    def remove_block(self, block_id: str) -> None:
        """Removes the block and cascades to any wire touching it."""
        model = self.document.model
        model.blocks = [b for b in model.blocks if b.id != block_id]
        model.wires = [
            w for w in model.wires if w.from_.block != block_id and w.to.block != block_id
        ]

    def set_param(self, block_id: str, name: str, value: ParamValue) -> None:
        self.get_block(block_id).params[name] = value

    # -- top-level model params (distinct from a block's own params) --------

    def add_model_param(
        self, name: str, value: ParamValue, *, unit: str | None = None, doc: str | None = None
    ) -> None:
        self.document.model.params.append(ParamEntry(name=name, value=value, unit=unit, doc=doc))

    # -- wires -------------------------------------------------------------------

    def connect(
        self,
        a: Endpoint,
        b: Endpoint,
        *,
        kind: PortKind,
        waypoints: list[tuple[int, int]] | None = None,
        net: str | None = None,
        id: str | None = None,
        pinned: bool = False,
    ) -> Wire:
        for ep in (a, b):
            if not any(blk.id == ep.block for blk in self.document.model.blocks):
                raise DanglingWireError(f"Endpoint {ep!r} refers to an unknown block")

        wire_id = id or self._auto_id("wire")
        if any(w.id == wire_id for w in self.document.model.wires):
            raise DuplicateIdError(f"Wire id {wire_id!r} already exists")

        # model_validate (not the constructor) so the `from` alias applies
        # without tripping mypy's default (non-pydantic-plugin) kwarg check.
        wire = Wire.model_validate(
            {
                "id": wire_id,
                "from": a,
                "to": b,
                "waypoints": waypoints or [],
                "pinned": pinned,
                "net": net,
                "kind": kind,
            }
        )
        self.document.model.wires.append(wire)
        return wire

    def disconnect(self, wire_id: str) -> None:
        model = self.document.model
        model.wires = [w for w in model.wires if w.id != wire_id]

    # -- subckt defs / instances --------------------------------------------

    def add_subckt_def(
        self,
        id: str,
        name: str,
        ports: list[SubcktPort],
        *,
        body: str = "",
        params: list[ParamEntry] | None = None,
        instances: list[SubcktInstance] | None = None,
    ) -> SubcktDefRef:
        defs = self.document.model.subckt_defs
        if any(d.id == id for d in defs):
            raise DuplicateIdError(f"SubcktDef id {id!r} already exists")

        new_def = SubcktDef(
            id=id, name=name, ports=ports, body=body, params=params or [], instances=instances or []
        )
        # Fail before mutating state: check the def graph including the new
        # def is still acyclic (same fail-fast-at-build-time style as
        # CrossParadigmWireError).
        check_no_cyclic_defs([*defs, new_def])
        defs.append(new_def)
        return SubcktDefRef(id)

    def instantiate_subckt(
        self,
        def_ref: str,
        position: tuple[int, int] = (0, 0),
        *,
        id: str | None = None,
        rotation: Rotation = 0,
        mirror: Mirror = "none",
        params_override: dict[str, ParamValue] | None = None,
        label: str | None = None,
    ) -> BlockRef:
        target = next((d for d in self.document.model.subckt_defs if d.id == def_ref), None)
        if target is None:
            raise UnknownSubcktDefError(f"No SubcktDef with id {def_ref!r}")

        kinds: set[str] = {p.kind for p in target.ports}
        domain: PortKind = cast(PortKind, next(iter(kinds))) if len(kinds) == 1 else "mixed"

        block_id = id or self._auto_id(def_ref)
        if any(b.id == block_id for b in self.document.model.blocks):
            raise DuplicateIdError(f"Block id {block_id!r} already exists")

        block = Block(
            id=block_id,
            type="spice-subckt.instance",
            paradigm="spice-subckt",
            domain=domain,
            fidelity="spice",
            position=position,
            rotation=rotation,
            mirror=mirror,
            params={"def_ref": def_ref, **(params_override or {})},
            label=label,
        )
        self.document.model.blocks.append(block)
        return BlockRef(self, block_id)

    # -- ids -----------------------------------------------------------------

    def _auto_id(self, type_or_prefix: str) -> str:
        base = type_or_prefix.rsplit(".", 1)[-1].replace("-", "_")
        counter = self._id_counters.setdefault(base, itertools.count(1))
        existing = {b.id for b in self.document.model.blocks} | {
            w.id for w in self.document.model.wires
        }
        for n in counter:
            candidate = f"{base}{n}"
            if candidate not in existing:
                return candidate
        raise AssertionError("unreachable")  # pragma: no cover
