"""Regression test — physical-electrical.source.{voltage,current}_{dc,ac}
registry key + param-name fix.

Found while building the power-electronics library audit: the v2 registry
was keyed with dotted type strings ("voltage.dc") while every catalog
block actually uses underscores ("voltage_dc"), so no source block could
ever compile through get_v2_render_info — UnsupportedBlockError on every
attempt. The AC renderers also read "amplitude"/"frequency" params that
don't exist in the catalog (which only declares "V"/"I"), so even a
correctly-keyed AC source would silently render a hardcoded 60Hz default
regardless of the user's actual value.
"""

from __future__ import annotations

import numpy as np
import pytest

from simulator.compiler.spice_netlist_writer import write_netlist
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph, IR1Net
from simulator.solvers.protocol import AnalysisRequest


def _pe_block(instance_id: str, block_type: str, **params: object) -> IR1Block:
    return IR1Block(
        instance_id=instance_id,
        block_type=block_type,
        paradigm="physical-network",
        domain="physical-electrical",
        fidelity="ideal",
        params=params,
    )


def _analysis_request(kind: str, **params: float | int | str | bool) -> AnalysisRequest:
    return AnalysisRequest(
        id=f"{kind.lower()}1", type=kind, params=dict(params), sweeps=[], solver_options={}
    )


def _render_single(block: IR1Block) -> str:
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))
    return next(line for line in netlist.splitlines() if line.startswith(("V", "I")))


def test_voltage_dc_uses_catalog_underscore_type() -> None:
    block = _pe_block("v1", "physical-electrical.source.voltage_dc", V=5.0)
    assert _render_single(block) == "Vv1 net2 net1 DC 5"


def test_voltage_ac_uses_catalog_underscore_type_and_v_param() -> None:
    block = _pe_block("v2", "physical-electrical.source.voltage_ac", V=3.3, freq=400.0, phase=90.0)
    assert _render_single(block) == "Vv2 net2 net1 DC 0 AC 3.3 SIN(0 3.3 400 0 0 90)"


def test_current_dc_uses_catalog_underscore_type() -> None:
    block = _pe_block("i1", "physical-electrical.source.current_dc", I=0.5)
    assert _render_single(block) == "Ii1 net2 net1 DC 0.5"


def test_current_ac_uses_catalog_underscore_type_and_i_param() -> None:
    block = _pe_block("i2", "physical-electrical.source.current_ac", I=2.0, freq=1000.0)
    assert _render_single(block) == "Ii2 net2 net1 DC 0 AC 2 SIN(0 2 1000 0 0 0)"


def test_voltage_pulse_renders_native_pulse_waveform() -> None:
    block = _pe_block(
        "p1",
        "physical-electrical.source.voltage_pulse",
        V1=0.0,
        V2=5.0,
        TD=0.0,
        TR=1e-9,
        TF=1e-9,
        PW=500e-9,
        PER=1e-6,
    )
    assert _render_single(block) == "Vp1 net2 net1 PULSE(0 5 0 1e-09 1e-09 5e-07 1e-06)"


def test_voltage_pulse_uses_catalog_defaults_when_params_missing() -> None:
    block = _pe_block("p2", "physical-electrical.source.voltage_pulse")
    assert _render_single(block) == "Vp2 net2 net1 PULSE(0 1 0 1e-09 1e-09 5e-07 1e-06)"


@pytest.mark.integration
def test_integration_voltage_pulse_drives_rc_low_pass() -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    ir1 = IR1Graph(
        blocks=[
            _pe_block(
                "vp",
                "physical-electrical.source.voltage_pulse",
                V1=0.0,
                V2=5.0,
                TD=0.0,
                TR=1e-9,
                TF=1e-9,
                PW=5e-3,
                PER=10e-3,
            ),
            _pe_block("r1", "physical-electrical.passive.resistor", R=1000.0),
            _pe_block("c1", "physical-electrical.passive.capacitor", C=1e-6),
        ],
        connections=[
            IR1Connection(
                src=("vp", "p"), dst=("r1", "p"), kind="physical-electrical", net="pulse"
            ),
            IR1Connection(
                src=("r1", "n"), dst=("c1", "p"), kind="physical-electrical", net="rc_out"
            ),
            IR1Connection(src=("c1", "n"), dst=("vp", "n"), kind="physical-electrical", net="gnd"),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )

    netlist = f"{write_netlist(ir1, _analysis_request('TRAN', t_end=10e-3, t_step=10e-6))}"
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="voltage-pulse-rc")

    out = next(s for s in result.signals if s.name.lower() == "v(rc_out)")
    t = result.time
    # RC = 1ms, pulse high for 5ms starting at t=0: by t=4.9ms the cap should
    # have charged well past 0 towards 5V (not still sitting at the 0V rail).
    idx = int(next(i for i, tv in enumerate(t) if tv > 4.9e-3))
    assert out.data[idx] > 2.0


@pytest.mark.integration
def test_integration_voltage_ac_transient_sine_matches_frequency() -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    ir1 = IR1Graph(
        blocks=[
            _pe_block("vac1", "physical-electrical.source.voltage_ac", V=10.0, freq=1000.0),
            _pe_block("r1", "physical-electrical.passive.resistor", R=1000.0),
        ],
        connections=[
            IR1Connection(
                src=("vac1", "p"), dst=("r1", "p"), kind="physical-electrical", net="vac"
            ),
            IR1Connection(
                src=("r1", "n"), dst=("vac1", "n"), kind="physical-electrical", net="gnd"
            ),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    netlist = write_netlist(ir1, _analysis_request("TRAN", t_end=1e-3, t_step=1e-6))
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="voltage-ac-transient")

    out = next(s for s in result.signals if s.name.lower() == "v(vac)")
    t = result.time
    # One full 1kHz cycle over 1ms: peak amplitude should reach close to
    # 10V, and the waveform should cross zero going both directions (a
    # real sine, not a flat/DC signal).
    assert float(np.max(out.data.real)) > 9.0
    assert float(np.min(out.data.real)) < -9.0
