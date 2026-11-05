"""BE-61 — B-source + XSPICE analog compiler pass for signal-flow blocks.

Covers:
- One parametrized case per signal_flow.math.*/logic.* block type, asserting
  exact B-source card text.
- Continuous/Discontinuities blocks emit the right XSPICE A-device + .model
  card pair.
- Integration (skipped if ngspice not on host): a
  gain->integrator->saturation chain solves via real ngspice and never
  exceeds the saturation limits.
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


@pytest.mark.parametrize(
    ("block_type", "params", "expected"),
    [
        ("signal-flow.math.abs", {}, "Bb1 out 0 V=abs(V(in))"),
        (
            "signal-flow.math.sign",
            {},
            "Bb1 out 0 V=(V(in) > 0 ? 1 : (V(in) < 0 ? -1 : 0))",
        ),
        ("signal-flow.math.sqrt", {}, "Bb1 out 0 V=sqrt(V(in))"),
        ("signal-flow.math.divide", {}, "Bb1 out 0 V=V(in0)/V(in1)"),
        ("signal-flow.math.gain", {"k": 2.0}, "Bb1 out 0 V=V(in)*2"),
        ("signal-flow.math.math_function", {"operator": "exp"}, "Bb1 out 0 V=exp(V(in))"),
        ("signal-flow.math.math_function", {"operator": "log"}, "Bb1 out 0 V=ln(V(in))"),
        ("signal-flow.math.product", {"signs": "**"}, "Bb1 out 0 V=V(in0)*V(in1)"),
        ("signal-flow.math.product", {"signs": "*/"}, "Bb1 out 0 V=V(in0)/V(in1)"),
        ("signal-flow.math.sum", {"signs": "++"}, "Bb1 out 0 V=V(in0)+V(in1)"),
        ("signal-flow.math.sum", {"signs": "+-"}, "Bb1 out 0 V=V(in0)-V(in1)"),
        ("signal-flow.math.trigonometric", {"operator": "sin"}, "Bb1 out 0 V=sin(V(in))"),
        ("signal-flow.logic.and", {}, "Bb1 out 0 V=V(in0) && V(in1)"),
        ("signal-flow.logic.or", {}, "Bb1 out 0 V=V(in0) || V(in1)"),
        ("signal-flow.logic.not", {}, "Bb1 out 0 V=!V(in)"),
        ("signal-flow.logic.compare", {"operator": ">="}, "Bb1 out 0 V=V(in0) >= V(in1)"),
        ("signal-flow.math.minmax", {"function": "min"}, "Bb1 out 0 V=min(V(in0),V(in1))"),
        ("signal-flow.math.minmax", {"function": "max"}, "Bb1 out 0 V=max(V(in0),V(in1))"),
        ("signal-flow.math.rounding", {"operator": "floor"}, "Bb1 out 0 V=floor(V(in))"),
        ("signal-flow.math.rounding", {"operator": "ceil"}, "Bb1 out 0 V=ceil(V(in))"),
    ],
)
def test_math_and_logic_block_card_text(
    block_type: str, params: dict[str, object], expected: str
) -> None:
    block = _block(block_type, **params)
    assert render(block, _nets(block_type)) == expected


def test_math_function_pow_unsupported() -> None:
    block = _block("signal-flow.math.math_function", operator="pow")
    with pytest.raises(UnsupportedSignalFlowParamError):
        render(block, _nets("signal-flow.math.math_function"))


def test_trigonometric_atan2_unsupported() -> None:
    block = _block("signal-flow.math.trigonometric", operator="atan2")
    with pytest.raises(UnsupportedSignalFlowParamError):
        render(block, _nets("signal-flow.math.trigonometric"))


def test_integrator_maps_ic_and_bounds() -> None:
    block = _block("signal-flow.continuous.integrator", ic=2.5, lo=-10.0, hi=10.0)
    text = render(block, _nets("signal-flow.continuous.integrator"))
    lines = text.splitlines()
    assert lines[0] == "Ab1 in out model_b1"
    assert lines[1].startswith(".model model_b1 int(")
    assert "out_ic=2.5" in lines[1]
    assert "out_lower_limit=-10" in lines[1]
    assert "out_upper_limit=10" in lines[1]


def test_derivative_card_text() -> None:
    block = _block("signal-flow.continuous.derivative")
    text = render(block, _nets("signal-flow.continuous.derivative"))
    assert text.splitlines()[0] == "Ab1 in out model_b1"
    assert ".model model_b1 d_dt(" in text


def test_transfer_function_num_den_coeff() -> None:
    block = _block(
        "signal-flow.continuous.transfer_function", num=[5.0], den=[1.0, 2.0, 3.0]
    )
    text = render(block, _nets("signal-flow.continuous.transfer_function"))
    model_line = text.splitlines()[1]
    assert "num_coeff=[5]" in model_line
    assert "den_coeff=[1 2 3]" in model_line
    assert model_line.startswith(".model model_b1 s_xfer(")


def test_saturation_rate_limiter_relay_card_text() -> None:
    sat = _block("signal-flow.discontinuity.saturation", lo=-3.0, hi=3.0)
    sat_text = render(sat, _nets("signal-flow.discontinuity.saturation"))
    assert "limit(" in sat_text
    assert "out_lower_limit=-3" in sat_text
    assert "out_upper_limit=3" in sat_text

    rl = _block("signal-flow.discontinuity.rate_limiter", rising=2.0, falling=-2.0)
    rl_text = render(rl, _nets("signal-flow.discontinuity.rate_limiter"))
    assert "slew(rise_slope=2 fall_slope=-2)" in rl_text

    relay = _block(
        "signal-flow.discontinuity.relay",
        on_switch=0.5,
        off_switch=-0.5,
        on_out=1.0,
        off_out=0.0,
    )
    relay_text = render(relay, _nets("signal-flow.discontinuity.relay"))
    assert "hyst(" in relay_text
    assert "in_low=-0.5" in relay_text
    assert "in_high=0.5" in relay_text


def test_lookup_1d_card_text() -> None:
    block = _block("signal-flow.lookup.1d", x=[0.0, 1.0, 2.0], y=[0.0, 10.0, 20.0])
    text = render(block, _nets("signal-flow.lookup.1d"))
    lines = text.splitlines()
    assert lines[0] == "Ab1 in out model_b1"
    assert lines[1] == ".model model_b1 pwl(x_array=[0 1 2] y_array=[0 10 20])"


def test_lookup_2d_unsupported() -> None:
    block = _block("signal-flow.lookup.2d")
    with pytest.raises(UnsupportedSignalFlowParamError, match="table2d"):
        render(block, _nets("signal-flow.lookup.2d"))


def test_write_netlist_emits_signal_flow_chain() -> None:
    ir1 = IR1Graph(
        blocks=[
            _block("signal-flow.math.gain", k=2.0),
        ],
    )
    ir1.blocks[0].instance_id = "gain1"
    netlist = write_netlist(
        ir1,
        AnalysisRequest(id="op1", type="OP", params={}, sweeps=[], solver_options={}),
    )
    assert "Bgain1" in netlist
    assert "V=V(" in netlist


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_gain_integrator_saturation_chain(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="vin",
                block_type="physical-electrical.source.voltage_dc",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"V": 1.0},
            ),
            IR1Block(
                instance_id="rgnd",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"R": 1.0},
            ),
            _block("signal-flow.math.gain", k=5.0),
            _block("signal-flow.continuous.integrator", ic=0.0, lo=-1e9, hi=1e9),
            _block("signal-flow.discontinuity.saturation", lo=-2.0, hi=2.0),
        ],
        connections=[
            # vin's return path needs a real ground reference (a DC path
            # to node "0") — rgnd's "p" terminal ties vin.n to the
            # is_reference net below; rgnd.n is left floating, which is
            # fine since nothing else needs it.
            IR1Connection(src=("vin", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
            IR1Connection(src=("vin", "p"), dst=("gain1", "in"), kind="signal", net="vin_net"),
            IR1Connection(src=("gain1", "out"), dst=("int1", "in"), kind="signal", net="gain_out"),
            IR1Connection(src=("int1", "out"), dst=("sat1", "in"), kind="signal", net="int_out"),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    ir1.blocks[2].instance_id = "gain1"
    ir1.blocks[3].instance_id = "int1"
    ir1.blocks[4].instance_id = "sat1"

    netlist = write_netlist(
        ir1,
        AnalysisRequest(id="tran1", type="TRAN", params={"t_end": 2e-3, "t_step": 1e-4}, sweeps=[], solver_options={}),
    )

    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="signal-flow-chain")

    sat_signal = next(s for s in result.signals if "sat1" in s.name.lower() or "4" in s.name)
    assert max(abs(v) for v in sat_signal.data) <= 2.0 + 1e-6


@pytest.mark.integration
def test_integration_lookup_1d_doubles_input(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="vin",
                block_type="physical-electrical.source.voltage_dc",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"V": 1.0},
            ),
            IR1Block(
                instance_id="rgnd",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"R": 1.0},
            ),
            _block("signal-flow.lookup.1d", x=[0.0, 1.0, 2.0], y=[0.0, 2.0, 4.0]),
            IR1Block(
                instance_id="rload",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"R": 1000.0},
            ),
        ],
        connections=[
            IR1Connection(src=("vin", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
            IR1Connection(src=("vin", "p"), dst=("lut1", "in"), kind="signal", net="vin_net"),
            IR1Connection(src=("lut1", "out"), dst=("rload", "p"), kind="signal", net="lut1_out"),
            IR1Connection(src=("rload", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    ir1.blocks[2].instance_id = "lut1"

    netlist = write_netlist(
        ir1,
        AnalysisRequest(id="op1", type="OP", params={}, sweeps=[], solver_options={}),
    )

    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="lookup-1d-int")

    out_signal = next(s for s in result.signals if s.name.lower() == "v(lut1_out)")
    # x=[0,1,2] -> y=[0,2,4] is a pure 2x scaling; Vin=1V should read back ~2V.
    assert abs(float(out_signal.data[0]) - 2.0) < 0.05
