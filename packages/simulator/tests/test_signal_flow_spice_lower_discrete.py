"""BE-62 — astate-based compiler pass for signal_flow.discrete.*.

Covers:
- unit_delay / delay compile to a single astate A-device.
- zero_order_hold is explicitly unsupported (documented gap — real_delay,
  the natural primitive, cannot be driven from a v-typed signal-flow net).
- discrete.integrator compiles to an astate feedback network whose shape
  differs by method (forward/backward/trapezoidal).
- Integration (skipped if ngspice not on host): a forward-Euler discrete
  integrator fed a step input solves via real ngspice and its output
  ramps in the expected direction.
"""

from __future__ import annotations

import pathlib

import pytest

from simulator.compiler.signal_flow_spice_lower import (
    UnsupportedSignalFlowParamError,
    get_ports,
    render,
)
from simulator.compiler.spice_netlist_writer import write_netlist
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph, IR1Net
from simulator.solvers.protocol import AnalysisRequest


def _block(block_type: str, **params: object) -> IR1Block:
    return IR1Block(
        instance_id="b1",
        block_type=block_type,
        paradigm="signal-flow",
        domain="signal",
        fidelity="n_a",
        params=params,
    )


def _nets(block_type: str) -> dict[str, str]:
    return {p: p for p in get_ports(block_type)}


def test_unit_delay_card_text() -> None:
    block = _block("signal-flow.discrete.unit_delay", ic=0.0)
    text = render(block, _nets("signal-flow.discrete.unit_delay"))
    assert text == "Ab1 in out model_b1\n.model model_b1 astate(astate_no=1)"


def test_delay_maps_length_to_astate_no() -> None:
    block = _block("signal-flow.discrete.delay", length=3)
    text = render(block, _nets("signal-flow.discrete.delay"))
    assert "astate(astate_no=3)" in text


def test_delay_length_out_of_range_rejected() -> None:
    block = _block("signal-flow.discrete.delay", length=7)
    with pytest.raises(UnsupportedSignalFlowParamError):
        render(block, _nets("signal-flow.discrete.delay"))


def test_zero_order_hold_unsupported() -> None:
    block = _block("signal-flow.discrete.zero_order_hold")
    with pytest.raises(UnsupportedSignalFlowParamError):
        render(block, _nets("signal-flow.discrete.zero_order_hold"))


def test_discrete_integrator_forward_euler_network() -> None:
    block = _block("signal-flow.discrete.integrator", method="forward", sample_time=0.01)
    text = render(block, _nets("signal-flow.discrete.integrator"))
    lines = text.splitlines()
    assert lines[0] == "Ab1y out b1_yprev model_b1y"
    assert lines[1] == ".model model_b1y astate(astate_no=1)"
    assert lines[2] == "Ab1u in b1_uprev model_b1u"
    assert lines[3] == ".model model_b1u astate(astate_no=1)"
    assert lines[4] == "Bb1 out 0 V=V(b1_yprev)+0.01*V(b1_uprev)"


def test_discrete_integrator_backward_euler_network() -> None:
    block = _block("signal-flow.discrete.integrator", method="backward", sample_time=0.01)
    text = render(block, _nets("signal-flow.discrete.integrator"))
    # Backward Euler uses the *current* input, no u-delay network needed.
    assert "b1_uprev" not in text
    assert text.splitlines()[-1] == "Bb1 out 0 V=V(b1_yprev)+0.01*V(in)"


def test_discrete_integrator_trapezoidal_network() -> None:
    block = _block("signal-flow.discrete.integrator", method="trapezoidal", sample_time=0.01)
    text = render(block, _nets("signal-flow.discrete.integrator"))
    assert "b1_uprev" in text
    assert text.splitlines()[-1] == "Bb1 out 0 V=V(b1_yprev)+(0.01/2)*(V(in)+V(b1_uprev))"


def test_discrete_integrator_unknown_method_rejected() -> None:
    block = _block("signal-flow.discrete.integrator", method="bogus")
    with pytest.raises(UnsupportedSignalFlowParamError):
        render(block, _nets("signal-flow.discrete.integrator"))


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


def _grounded_dc_source_blocks(v: float) -> tuple[list[IR1Block], list[IR1Connection]]:
    """A DC voltage source with a proper ground return path (rgnd's "p"
    terminal ties vin.n to the is_reference net; rgnd.n is left floating),
    matching the pattern verified in BE-61's integration test."""
    blocks = [
        IR1Block(
            instance_id="vin",
            block_type="physical-electrical.source.voltage_dc",
            paradigm="physical-network",
            domain="physical-electrical",
            fidelity="ideal",
            params={"V": v},
        ),
        IR1Block(
            instance_id="rgnd",
            block_type="physical-electrical.passive.resistor",
            paradigm="physical-network",
            domain="physical-electrical",
            fidelity="ideal",
            params={"R": 1.0},
        ),
    ]
    connections = [
        IR1Connection(src=("vin", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
    ]
    return blocks, connections


def _load_block(instance_id: str) -> IR1Block:
    """A resistor purely so the signal-flow block's output net gets a
    known, explicit name (via the wire's .net field) instead of an
    unpredictable auto-assigned net1/net2/... name."""
    return IR1Block(
        instance_id=instance_id,
        block_type="physical-electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        fidelity="ideal",
        params={"R": 1000.0},
    )


@pytest.mark.integration
def test_integration_unit_delay_step_response(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    src_blocks, src_conns = _grounded_dc_source_blocks(1.0)
    ir1 = IR1Graph(
        blocks=[
            *src_blocks,
            _block("signal-flow.discrete.unit_delay", ic=0.0),
            _load_block("rload"),
        ],
        connections=[
            *src_conns,
            IR1Connection(src=("vin", "p"), dst=("d1", "in"), kind="signal", net="vin_net"),
            IR1Connection(src=("d1", "out"), dst=("rload", "p"), kind="signal", net="d1_out"),
            IR1Connection(
                src=("rload", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"
            ),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    ir1.blocks[2].instance_id = "d1"

    netlist = write_netlist(
        ir1,
        AnalysisRequest(
            id="tran1",
            type="TRAN",
            params={"t_end": 5e-3, "t_step": 1e-4},
            sweeps=[],
            solver_options={},
        ),
    )

    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="unit-delay-int")

    out_signal = next(s for s in result.signals if s.name.lower() == "v(d1_out)")
    # astate's own initial state is 0, then locks onto the constant 1V
    # input after the very first internal timestep — this proves the
    # delayed-state network actually drives real ngspice rather than
    # producing a static/undriven node.
    assert max(out_signal.data) > 0.5


@pytest.mark.integration
def test_integration_discrete_integrator_forward_euler(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    src_blocks, src_conns = _grounded_dc_source_blocks(1.0)
    ir1 = IR1Graph(
        blocks=[
            *src_blocks,
            _block("signal-flow.discrete.integrator", method="forward", sample_time=1e-4),
            _load_block("rload"),
        ],
        connections=[
            *src_conns,
            IR1Connection(src=("vin", "p"), dst=("int1", "in"), kind="signal", net="vin_net"),
            IR1Connection(src=("int1", "out"), dst=("rload", "p"), kind="signal", net="int1_out"),
            IR1Connection(
                src=("rload", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"
            ),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    ir1.blocks[2].instance_id = "int1"

    netlist = write_netlist(
        ir1,
        AnalysisRequest(
            id="tran1",
            type="TRAN",
            params={"t_end": 2e-3, "t_step": 1e-4},
            sweeps=[],
            solver_options={},
        ),
    )

    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="discrete-integrator-int")

    out_signal = next(s for s in result.signals if s.name.lower() == "v(int1_out)")
    # Integrating a constant 1V input should ramp the output upward
    # (monotonically increasing), not stay flat at zero.
    assert out_signal.data[-1] > out_signal.data[0]
