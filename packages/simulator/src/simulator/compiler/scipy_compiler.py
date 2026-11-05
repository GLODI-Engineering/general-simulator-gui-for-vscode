"""IR-2 → scipy callable compiler (BE-14).

Produces a CompiledModel containing the f(t, x) → dx/dt closure that
scipy's solve_ivp consumes.
"""

from __future__ import annotations

import logging

import numpy as np

from simulator.compiler.codegen_state import CompiledModel, ObservationHook
from simulator.ir.ir2 import IR2System

logger = logging.getLogger(__name__)


def compile(ir2: IR2System) -> CompiledModel:
    """Compile an IR2System into a CompiledModel with a scipy-compatible closure."""

    # Build lookup: (block_id, port_id) -> which block's output provides this signal.
    # connection map: dst (block_id, port_id) -> src (block_id, port_id)
    conn_map: dict[tuple[str, str], tuple[str, str]] = {}
    for src, dst in ir2.connections:
        conn_map[dst] = src

    # For sum blocks with variadic inputs, we need to know the port mapping.
    # In the gsim schema, the wire's dst.port already has the concrete port id.

    block_by_id = {inst.block.instance_id: inst for inst in ir2.blocks}

    # Observation hooks for sink blocks.
    hooks: list[ObservationHook] = []
    hook_map: dict[str, ObservationHook] = {}  # block_id -> hook
    for inst in ir2.blocks:
        if inst.causality == "sink":
            hook = ObservationHook(block_id=inst.block.instance_id, port_id="in")
            hooks.append(hook)
            hook_map[inst.block.instance_id] = hook

    # Signal names for result manifest.
    signal_names: dict[tuple[str, str], str] = {}
    for inst in ir2.blocks:
        if inst.causality == "sink":
            label = inst.block.params.get("label", inst.block.instance_id)
            signal_names[(inst.block.instance_id, "in")] = str(label)

    n_states = len(ir2.state_layout)
    x0 = np.array(ir2.x0, dtype=float)

    eval_order = ir2.eval_order

    def f(t: float, x: np.ndarray) -> np.ndarray:
        """Evaluate all block derivatives in topological order."""
        dx = np.zeros(n_states)
        # Output buffer: maps (block_id, port_id) -> float value
        output_buf: dict[tuple[str, str], float] = {}

        for block_id in eval_order:
            inst = block_by_id.get(block_id)
            if inst is None:
                continue

            # Gather inputs from output buffer via connection map.
            inputs: dict[str, float] = {}
            # Find all connections targeting this block.
            for (dst_bid, dst_port), (src_bid, src_port) in conn_map.items():
                if dst_bid == block_id:
                    val = output_buf.get((src_bid, src_port), 0.0)
                    inputs[dst_port] = val

            # Extract state slice for this block.
            state: dict[str, float] = {}
            for var in inst.state_vars:
                idx = ir2.state_layout.get((block_id, var))
                if idx is not None:
                    state[var] = float(x[idx])

            # Evaluate equations.
            outputs, dstate = inst.equations.derivatives(t, inputs, state, inst.block.params)

            # Write outputs to buffer.
            for port_id, val in outputs.items():
                output_buf[(block_id, port_id)] = val

            # Write dstate to dx.
            for var, dval in dstate.items():
                idx = ir2.state_layout.get((block_id, var))
                if idx is not None:
                    dx[idx] = dval

            # Observation hook for sink blocks.
            if block_id in hook_map:
                hook_map[block_id].values.append(inputs.get("in", 0.0))
                hook_map[block_id].times.append(t)

        return dx

    return CompiledModel(
        f=f,
        x0=x0,
        state_layout=ir2.state_layout,
        observation_hooks=hooks,
        n_states=n_states,
        signal_names=signal_names,
    )


compile_model = compile
