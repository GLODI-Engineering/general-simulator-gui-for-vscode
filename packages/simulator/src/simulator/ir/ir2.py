"""IR-2 dataclasses (flat ODE system — control subset)."""

from __future__ import annotations

from dataclasses import dataclass, field

from simulator.equation_templates.protocol import BlockEquations
from simulator.ir.ir1 import IR1Block


@dataclass
class InstantiatedBlock:
    block: IR1Block
    equations: BlockEquations
    state_vars: list[str]  # state variable names for this instance
    causality: str  # "source", "sink", or "causal"


@dataclass
class IR2System:
    blocks: list[InstantiatedBlock] = field(default_factory=list)
    # (block_id, var_name) -> index in flat state vector
    state_layout: dict[tuple[str, str], int] = field(default_factory=dict)
    # (block_id, port_id) -> index in output buffer
    output_layout: dict[tuple[str, str], int] = field(default_factory=dict)
    sources: list[str] = field(default_factory=list)  # block ids with causality=source
    sinks: list[str] = field(default_factory=list)  # block ids with causality=sink
    eval_order: list[str] = field(default_factory=list)  # topological evaluation order
    # connections as (src_block_id, src_port) -> (dst_block_id, dst_port)
    connections: list[tuple[tuple[str, str], tuple[str, str]]] = field(default_factory=list)
    # initial state vector
    x0: list[float] = field(default_factory=list)
    has_circuit_elements: bool = False
