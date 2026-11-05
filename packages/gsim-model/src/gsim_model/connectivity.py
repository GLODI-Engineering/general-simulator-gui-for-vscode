"""ConnectivityGraph — answers "is A connected to B, through which ports,
and via what" for a .gsim_sch v2 document.

Built on top of the real compiler passes (gsim_sch_flatten.flatten,
goto_from_resolve.resolve_goto_from) rather than reimplementing subsystem
flattening / tag resolution, so the answers never drift from what the
simulator actually simulates. Subckt-style opaque bodies (once added to the
schema) will naturally be graph leaves: connectivity stops at their port
boundary since their internals never appear as blocks/wires.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from gsim_model.document import GsimSchDocument
from gsim_model.wire import Endpoint, Wire

HopKind = Literal["wire", "goto_from"]


@dataclass(frozen=True)
class Hop:
    endpoint: Endpoint
    wire_id: str
    via: HopKind


class ConnectivityGraph:
    def __init__(self, wires: list[Wire]) -> None:
        self._wires = wires
        self._adjacency: dict[Endpoint, list[tuple[Endpoint, Wire]]] = {}
        for w in wires:
            self._adjacency.setdefault(w.from_, []).append((w.to, w))
            self._adjacency.setdefault(w.to, []).append((w.from_, w))

        # Union-find over endpoints -> net groups, mirroring the same
        # algorithm spice_netlist_writer.py uses to compute SPICE nets.
        parent: dict[Endpoint, Endpoint] = {}

        def find(ep: Endpoint) -> Endpoint:
            root = parent.setdefault(ep, ep)
            if root != ep:
                root = find(root)
                parent[ep] = root
            return root

        def union(a: Endpoint, b: Endpoint) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[rb] = ra

        # Two passes: union() reparents roots as later wires merge groups
        # together, so a name recorded against find(w.from_) mid-loop can
        # go stale — a later union may fold that very root under a new
        # parent, leaving the old key orphaned and net_of() silently
        # falling back to a synthesized name instead of the real one.
        # Collect (root-at-tag-time, name) first, then re-resolve every
        # key through the *final* union-find structure once all wires
        # are processed.
        provisional_named_nets: list[tuple[Endpoint, str]] = []
        for w in wires:
            union(w.from_, w.to)
            if w.net:
                provisional_named_nets.append((find(w.from_), w.net))

        self._named_nets: dict[Endpoint, str] = {}
        for root, name in provisional_named_nets:
            self._named_nets[find(root)] = name

        self._find = find

    @classmethod
    def from_document(cls, document: GsimSchDocument) -> ConnectivityGraph:
        from simulator.compiler import goto_from_resolve, gsim_sch_flatten, gsim_sch_loader

        loaded = gsim_sch_loader.load(document.to_raw_dict())
        flattened = gsim_sch_flatten.flatten(loaded)
        resolved = goto_from_resolve.resolve_goto_from(flattened)
        wires = [Wire.model_validate(w) for w in resolved.model.get("wires", [])]
        return cls(wires)

    # -- queries ---------------------------------------------------------------

    def neighbors(self, block_id: str, port_id: str) -> list[Endpoint]:
        """Direct, one-wire-hop neighbors of a port."""
        ep = Endpoint(block=block_id, port=port_id)
        return [nbr for nbr, _wire in self._adjacency.get(ep, [])]

    def net_of(self, block_id: str, port_id: str) -> str:
        """The net name this port belongs to (explicit Wire.net if any wire
        in the net declared one, else a synthesized deterministic name)."""
        ep = Endpoint(block=block_id, port=port_id)
        root = self._find(ep)
        if root in self._named_nets:
            return self._named_nets[root]
        return f"{root.block}:{root.port}"

    def all_in_net(self, block_id: str, port_id: str) -> list[Endpoint]:
        """Every port that shares a net with (block_id, port_id), including
        itself — the transitive closure of direct wire connections."""
        ep = Endpoint(block=block_id, port=port_id)
        root = self._find(ep)
        members = {candidate for candidate in self._adjacency if self._find(candidate) == root}
        members.add(ep)
        return sorted(members, key=lambda e: (e.block, e.port))

    def is_connected(self, a: Endpoint, b: Endpoint) -> bool:
        """True if *a* and *b* are on the same net (any number of direct
        wire hops, including Goto/From bridges resolved beforehand)."""
        return self._find(a) == self._find(b)

    def path(self, a: Endpoint, b: Endpoint) -> list[Hop] | None:
        """BFS shortest hop-path from *a* to *b*, labeling each hop as a
        direct wire or a resolved Goto/From tag bridge, so callers can
        explain *why* two ports are connected, not just *that* they are."""
        if a == b:
            return []
        visited = {a}
        frontier: list[tuple[Endpoint, list[Hop]]] = [(a, [])]
        while frontier:
            next_frontier: list[tuple[Endpoint, list[Hop]]] = []
            for current, path_so_far in frontier:
                for neighbor, wire in self._adjacency.get(current, []):
                    if neighbor in visited:
                        continue
                    via: HopKind = "goto_from" if wire.id.startswith("_goto_") else "wire"
                    new_path = [*path_so_far, Hop(endpoint=neighbor, wire_id=wire.id, via=via)]
                    if neighbor == b:
                        return new_path
                    visited.add(neighbor)
                    next_frontier.append((neighbor, new_path))
            frontier = next_frontier
        return None
