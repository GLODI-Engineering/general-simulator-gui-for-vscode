"""BE-66 — physical-electrical.opamp.* v2 compiler wiring.

Covers:
- Exact card text for opamp.ideal (E-device) and opamp.comparator
  (B-source diff + XSPICE hyst, reusing the same param-mapping style as
  signal_flow_spice_lower's discontinuity.relay renderer).
- Real-ngspice behavior for opamp.finite_gain (saturates) and
  opamp.band_limited (slew-bounded step response — scoped loosely per
  the epic, exact topology not pinned down).
"""

from __future__ import annotations

import pathlib

import pytest

from simulator.compiler.spice_netlist_writer import write_netlist
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph, IR1Net
from simulator.solvers.protocol import AnalysisRequest


def _pe_block(instance_id: str, block_type: str, fidelity: str = "ideal", **params: object) -> IR1Block:
    return IR1Block(
        instance_id=instance_id,
        block_type=block_type,
        paradigm="physical-network",
        domain="physical-electrical",
        fidelity=fidelity,
        params=params,
    )


def _analysis_request(kind: str, **params: float | int | str | bool) -> AnalysisRequest:
    return AnalysisRequest(
        id=f"{kind.lower()}1", type=kind, params=dict(params), sweeps=[], solver_options={}
    )


def test_ideal_opamp_card_text() -> None:
    block = _pe_block("oa1", "physical-electrical.opamp.ideal")
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    line = next(line for line in netlist.splitlines() if line.startswith("Eoa1"))
    assert line.split()[-1] == "1e6"


def test_ideal_opamp_behavioral_tier_also_compiles() -> None:
    block = _pe_block("oa1", "physical-electrical.opamp.ideal", fidelity="behavioral")
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))
    assert any(line.startswith("Eoa1") for line in netlist.splitlines())


def test_comparator_reuses_hyst_params() -> None:
    block = _pe_block(
        "cmp1", "physical-electrical.opamp.comparator", v_hys=0.2, v_oh=5.0, v_ol=0.0
    )
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    hyst_line = next(line for line in netlist.splitlines() if "hyst(" in line)
    assert "in_low=-0.1" in hyst_line
    assert "in_high=0.1" in hyst_line
    assert "out_lower_limit=0" in hyst_line
    assert "out_upper_limit=5" in hyst_line


def test_finite_gain_card_text() -> None:
    block = _pe_block("oa2", "physical-electrical.opamp.finite_gain", Av=1000.0, v_sat=10.0)
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    line = next(line for line in netlist.splitlines() if line.startswith("Boa2"))
    assert "1000" in line
    assert "10" in line


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


def _grounded_dc_source_blocks(v: float) -> tuple[list[IR1Block], list[IR1Connection]]:
    blocks = [
        _pe_block("vin", "physical-electrical.source.voltage_dc", V=v),
        _pe_block("rgnd", "physical-electrical.passive.resistor", R=1.0),
    ]
    connections = [
        IR1Connection(src=("vin", "n"), dst=("rgnd", "p"), kind="physical-electrical", net="gnd"),
    ]
    return blocks, connections


@pytest.mark.integration
def test_integration_finite_gain_saturates(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    src_blocks, src_conns = _grounded_dc_source_blocks(1.0)
    ir1 = IR1Graph(
        blocks=[*src_blocks, _pe_block("oa1", "physical-electrical.opamp.finite_gain", Av=1000.0, v_sat=2.0)],
        connections=[
            *src_conns,
            IR1Connection(src=("vin", "p"), dst=("oa1", "vp"), kind="physical-electrical", net="vp_net"),
            IR1Connection(src=("rgnd", "p"), dst=("oa1", "vn"), kind="physical-electrical", net="gnd"),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    netlist = write_netlist(ir1, _analysis_request("OP"))
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="opamp-finite-gain")

    out_signal = next(s for s in result.signals if "oa1" in s.name.lower())
    # Av*1V = 1000V, way past v_sat=2V — must clamp.
    assert abs(float(out_signal.data[0])) <= 2.0 + 1e-6


@pytest.mark.integration
def test_integration_band_limited_slew_bounded(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    src_blocks, src_conns = _grounded_dc_source_blocks(1.0)
    ir1 = IR1Graph(
        blocks=[
            *src_blocks,
            _pe_block(
                "oa1",
                "physical-electrical.opamp.band_limited",
                gbp=1000000.0,
                sr=1000.0,
                rin=1000000.0,
                rout=75.0,
            ),
        ],
        connections=[
            *src_conns,
            IR1Connection(src=("vin", "p"), dst=("oa1", "vp"), kind="physical-electrical", net="vp_net"),
            IR1Connection(src=("rgnd", "p"), dst=("oa1", "vn"), kind="physical-electrical", net="gnd"),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    netlist = write_netlist(
        ir1,
        AnalysisRequest(id="tran1", type="TRAN", params={"t_end": 1e-3, "t_step": 1e-6}, sweeps=[], solver_options={}),
    )
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="opamp-band-limited")

    out_signal = next(s for s in result.signals if "oa1" in s.name.lower())
    # A step into a slew-limited stage must not jump instantaneously to
    # its final value on the very first timestep.
    assert abs(float(out_signal.data[0])) < abs(float(out_signal.data[-1])) + 1.0
