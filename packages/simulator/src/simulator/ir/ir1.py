"""IR-1 dataclasses (topology graph)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, TypeAlias

# v2 simulation payload aliases (schema-shaped dicts from .gsim_sch).
Analysis: TypeAlias = dict[str, Any]
SolverOptions: TypeAlias = dict[str, Any]
IC: TypeAlias = dict[str, Any]
OutputSpec: TypeAlias = dict[str, Any]


@dataclass
class IR1Block:
    instance_id: str  # UUID from gsim
    block_type: str  # catalog key (e.g. "control.gain")
    paradigm: str = "signal-flow"  # e.g. signal-flow, physical-network, hierarchy
    domain: str = "signal"  # e.g. signal, physical-electrical
    fidelity: str = "n_a"  # ideal, behavioral, spice, n_a
    params: dict[str, Any] = field(default_factory=dict)  # parameter values
    ic: dict[str, Any] = field(default_factory=dict)
    # Execution-kind hints populated by gsim_sch_flatten (BE-32).
    # None for blocks with no subsystem execution constraint.
    execution_kind: str | None = None  # 'atomic' | 'enabled' | 'triggered'
    enable_signal: tuple[str, str] | None = None  # (block_id, port) for 'enabled'
    trigger_signal: tuple[str, str] | None = None  # (block_id, port) for 'triggered'
    trigger_kind: str | None = None  # 'rising' | 'falling' | 'either' for 'triggered'


@dataclass
class BusLayout:
    """Layout descriptor for a bus signal: ordered list of (element_name, dim) pairs."""

    elements: list[tuple[str, list[int]]] = field(default_factory=list)


@dataclass
class IR1Connection:
    src: tuple[str, str]  # (block instance id, port id)
    dst: tuple[str, str]  # (block instance id, port id)
    kind: str = "signal"
    net: str | None = None
    dim: list[int] | None = None  # populated by dim_propagate (BE-43)
    bus_layout: BusLayout | None = None  # populated for bus signals (BE-43)


@dataclass
class DataStoreSlot:
    """Declared shared-memory slot for data_store_* routing blocks."""

    name: str
    initial_value: Any  # scalar or list
    dim: list[int]


@dataclass
class IR1Net:
    name: str
    kind: str
    scope: str
    is_reference: bool = False


@dataclass
class IR1SimulationDirective:
    analyses: list[Analysis] = field(default_factory=list)
    solver: SolverOptions = field(default_factory=dict)
    initial_conditions: list[IC] = field(default_factory=list)
    output: OutputSpec = field(default_factory=dict)
    default_analysis: str = ""


@dataclass
class IR1SubcktPort:
    id: str
    kind: str


@dataclass
class IR1SubcktInstance:
    """A structured reference from one SubcktDef's body to another SubcktDef
    — emitted as a nested X-card inside the parent's .SUBCKT block."""

    id: str
    def_ref: str
    connections: list[str] = field(default_factory=list)
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class IR1SubcktDef:
    """Emitted once as ``.SUBCKT <name> <ports...> ... .ENDS``, regardless of
    how many spice-subckt.instance blocks (or nested IR1SubcktInstances)
    reference it via def_ref."""

    id: str
    name: str
    ports: list[IR1SubcktPort] = field(default_factory=list)
    params: list[dict[str, Any]] = field(default_factory=list)
    instances: list[IR1SubcktInstance] = field(default_factory=list)
    body: str = ""


@dataclass
class IR1Graph:
    blocks: list[IR1Block] = field(default_factory=list)
    connections: list[IR1Connection] = field(default_factory=list)
    params: dict[str, float] = field(default_factory=dict)
    nets: list[IR1Net] = field(default_factory=list)
    simulation: IR1SimulationDirective = field(default_factory=IR1SimulationDirective)
    subckt_defs: list[IR1SubcktDef] = field(default_factory=list)
