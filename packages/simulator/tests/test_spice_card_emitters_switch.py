"""BE-65 — physical-electrical.switch.* v2 compiler wiring + parameterized
ideal-switching diode.

Covers:
- Exact S-device/W-device + .MODEL card text for all three switch types.
- The diode model-override rule: explicit Is/N/Rs -> auto-generated
  per-instance .MODEL; a custom model name with no overrides -> untouched,
  no .MODEL card generated (so a real manufacturer part reference is never
  silently clobbered); no model at all -> our own ideal "D" default.
- Integration (skipped if ngspice not on host): a control-voltage-toggled
  switch driving an RC network actually toggles conduction.
"""

from __future__ import annotations

import pathlib

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


def test_voltage_controlled_switch_card_text() -> None:
    block = _pe_block(
        "sw1",
        "physical-electrical.switch.voltage_controlled",
        v_on=1.0,
        v_off=0.0,
        r_on=0.001,
        r_off=1000000.0,
    )
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    lines = netlist.splitlines()
    inst_line = next(line for line in lines if line.startswith("Ssw1"))
    model_line = next(line for line in lines if line.startswith(".model SWMOD_sw1"))
    assert inst_line.split()[0] == "Ssw1"
    assert model_line == ".model SWMOD_sw1 SW(VT=0.5 VH=0.5 RON=0.001 ROFF=1e+06)"


def test_generic_switch_control_tied_to_ground() -> None:
    block = _pe_block(
        "sw2", "physical-electrical.switch.generic", threshold=0.5, r_on=0.01, r_off=1e5
    )
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    inst_line = next(line for line in netlist.splitlines() if line.startswith("Ssw2"))
    parts = inst_line.split()
    assert parts[-2] == "0"  # second control node tied to ground
    assert parts[-1] == "SWMOD_sw2"


def test_current_controlled_switch_uses_sense_branch() -> None:
    block = _pe_block(
        "sw3",
        "physical-electrical.switch.current_controlled",
        i_on=0.01,
        i_off=0.0,
        r_on=0.01,
        r_off=1e5,
    )
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    lines = netlist.splitlines()
    sense_line = next(line for line in lines if line.startswith("Vsnssw3"))
    w_line = next(line for line in lines if line.startswith("Wsw3"))
    assert sense_line.endswith("DC 0")
    assert "Vsnssw3" in w_line
    model_line = next(line for line in lines if line.startswith(".model CSWMOD_sw3"))
    assert "IT=0.005" in model_line
    assert "IH=0.005" in model_line


def test_diode_with_is_n_rs_gets_own_model() -> None:
    d1 = _pe_block("d1", "physical-electrical.semiconductor.diode", Is=1e-9, N=1.2, Rs=0.05)
    d2 = _pe_block("d2", "physical-electrical.semiconductor.diode", Is=2e-9)
    ir1 = IR1Graph(blocks=[d1, d2])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    assert ".MODEL DMOD_d1 D(Is=1e-09 N=1.2 Rs=0.05)" in netlist
    assert ".MODEL DMOD_d2 D(Is=2e-09)" in netlist
    d1_line = next(line for line in netlist.splitlines() if line.startswith("Dd1"))
    d2_line = next(line for line in netlist.splitlines() if line.startswith("Dd2"))
    assert d1_line.endswith("DMOD_d1")
    assert d2_line.endswith("DMOD_d2")


def test_diode_with_custom_model_name_is_never_auto_generated() -> None:
    """A diode referencing a real manufacturer part by name (no Is/N/Rs
    overrides) must get NO .MODEL card at all — auto-generating one would
    silently shadow the real model the user supplies externally."""
    block = _pe_block("d1", "physical-electrical.semiconductor.diode", model="1N4148")
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    assert ".MODEL 1N4148" not in netlist
    d_line = next(line for line in netlist.splitlines() if line.startswith("Dd1"))
    assert d_line.endswith("1N4148")


def test_diode_with_no_model_gets_default_ideal_model() -> None:
    block = _pe_block("d1", "physical-electrical.semiconductor.diode")
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    assert ".MODEL D D(Is=1n N=1 Rs=0.01)" in netlist
    d_line = next(line for line in netlist.splitlines() if line.startswith("Dd1"))
    assert d_line.endswith(" D")


def test_two_default_diodes_share_one_model_card() -> None:
    d1 = _pe_block("d1", "physical-electrical.semiconductor.diode")
    d2 = _pe_block("d2", "physical-electrical.semiconductor.diode")
    ir1 = IR1Graph(blocks=[d1, d2])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    assert netlist.count(".MODEL D D(") == 1


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_switch_rc_toggle(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    ir1 = IR1Graph(
        blocks=[
            _pe_block("vin", "physical-electrical.source.voltage_dc", V=5.0),
            _pe_block("rgnd", "physical-electrical.passive.resistor", R=1.0),
            _pe_block("vctl", "physical-electrical.source.voltage_dc", V=2.0),
            _pe_block(
                "sw1",
                "physical-electrical.switch.voltage_controlled",
                v_on=1.0,
                v_off=0.0,
                r_on=0.001,
                r_off=1000000.0,
            ),
            _pe_block("rload", "physical-electrical.passive.resistor", R=1000.0),
        ],
        connections=[
            IR1Connection(src=("vin", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
            IR1Connection(src=("vctl", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
            IR1Connection(src=("vin", "p"), dst=("sw1", "p"), kind="physical-electrical", net="vin_net"),
            IR1Connection(src=("sw1", "n"), dst=("rload", "p"), kind="physical-electrical", net="sw_out"),
            IR1Connection(src=("rload", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
            IR1Connection(src=("vctl", "p"), dst=("sw1", "p_ctl"), kind="physical-electrical", net="ctl_net"),
            IR1Connection(src=("sw1", "n_ctl"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )

    netlist = write_netlist(ir1, _analysis_request("OP"))
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="switch-rc-on")

    out_signal = next(s for s in result.signals if s.name.lower() == "v(sw_out)")
    # Control (2V) is above v_on (1V): switch should be ON, output near 5V.
    assert out_signal.data[0] > 4.0
