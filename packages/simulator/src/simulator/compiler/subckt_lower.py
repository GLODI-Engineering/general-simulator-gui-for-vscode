"""SPICE subckt lowering (BE-59).

Validates SubcktDef/SubcktInstance/spice-subckt.instance references at
IR1-build time, before any netlist is written or solver runs — same
fail-fast-at-build-time style as converter_lower.CrossParadigmWireError and
goto_from_resolve's UnresolvedTagError, rather than surfacing a bad
def_ref/cycle as an opaque ngspice parse error.
"""

from __future__ import annotations

from simulator.ir.ir1 import IR1SubcktDef


class CyclicSubcktDefError(ValueError):
    """Raised when a SubcktDef's instances (transitively, via def_ref)
    reference their own id."""


class UnknownSubcktDefRefError(ValueError):
    """Raised when a def_ref (from a nested SubcktInstance or a top-level
    spice-subckt.instance Block) does not resolve to any declared
    SubcktDef."""


def check_no_cyclic_defs(defs: list[IR1SubcktDef]) -> None:
    by_id = {d.id: d for d in defs}
    white, gray, black = 0, 1, 2
    color: dict[str, int] = dict.fromkeys(by_id, white)

    def visit(def_id: str, chain: list[str]) -> None:
        if def_id not in by_id:
            return  # dangling def_ref — reported separately by check_def_refs_resolve
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


def check_def_refs_resolve(defs: list[IR1SubcktDef], block_def_refs: list[tuple[str, str]]) -> None:
    """*block_def_refs*: ``(block_instance_id, def_ref)`` for every
    spice-subckt.instance block in the design."""
    by_id = {d.id: d for d in defs}
    for d in defs:
        for inst in d.instances:
            if inst.def_ref not in by_id:
                raise UnknownSubcktDefRefError(
                    f"SubcktDef {d.id!r} instance {inst.id!r} references "
                    f"unknown def_ref {inst.def_ref!r}"
                )
    for block_id, def_ref in block_def_refs:
        if def_ref not in by_id:
            raise UnknownSubcktDefRefError(
                f"Block {block_id!r} references unknown SubcktDef def_ref {def_ref!r}"
            )
