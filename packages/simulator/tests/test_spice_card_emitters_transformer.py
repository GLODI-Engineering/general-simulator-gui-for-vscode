"""BE-67 — physical-electrical.passive.{transformer,mutual_inductor} v2
compiler wiring.

Covers:
- Exact L/L/K card text for a known L1/L2/k combination.
- No direct DC path is ever created between primary and secondary nets.
- Integration (skipped if ngspice not on host): an AC-driven primary
  produces a secondary voltage matching the configured turns ratio.
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


def test_mutual_inductor_card_text() -> None:
    block = _pe_block("m1", "physical-electrical.passive.mutual_inductor", L1=1e-3, L2=4e-3, k=0.95)
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    lines = netlist.splitlines()
    assert any(line.startswith("Lm11 ") and line.endswith(" 0.001") for line in lines)
    assert any(line.startswith("Lm12 ") and line.endswith(" 0.004") for line in lines)
    k_line = next(line for line in lines if line.startswith("Km1"))
    assert k_line == "Km1 Lm11 Lm12 0.95"


def test_transformer_card_text_uses_turns_ratio_squared() -> None:
    block = _pe_block("t1", "physical-electrical.passive.transformer", n=5.0)
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    lines = netlist.splitlines()
    l1_line = next(line for line in lines if line.startswith("Lt11 "))
    l2_line = next(line for line in lines if line.startswith("Lt12 "))
    l1_val = float(l1_line.split()[-1])
    l2_val = float(l2_line.split()[-1])
    assert abs(l2_val / l1_val - 25.0) < 1e-9  # n^2 = 25


def test_no_dc_path_between_windings() -> None:
    block = _pe_block("t1", "physical-electrical.passive.transformer", n=2.0)
    ir1 = IR1Graph(blocks=[block])
    netlist = write_netlist(ir1, _analysis_request("OP"))

    # Only L/K cards reference this instance — no R/V/B/E element ties a
    # p1/n1 net directly to a p2/n2 net.
    lines = [line for line in netlist.splitlines() if line.startswith(("Lt1", "Kt1"))]
    assert len(lines) == 3


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_transformer_voltage_ratio(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    ir1 = IR1Graph(
        blocks=[
            _pe_block("vin", "physical-electrical.source.voltage_ac", amplitude=1.0, frequency=1000.0),
            _pe_block("t1", "physical-electrical.passive.transformer", n=5.0),
            _pe_block("rload", "physical-electrical.passive.resistor", R=1000.0),
        ],
        connections=[
            IR1Connection(src=("vin", "p"), dst=("t1", "p1"), kind="physical-electrical", net="prim_hi"),
            IR1Connection(src=("vin", "n"), dst=("t1", "n1"), kind="physical-electrical", net="gnd"),
            IR1Connection(src=("t1", "p2"), dst=("rload", "p"), kind="physical-electrical", net="sec_hi"),
            IR1Connection(src=("t1", "n2"), dst=("rload", "n"), kind="physical-electrical", net="gnd"),
        ],
        nets=[IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True)],
    )
    netlist = write_netlist(ir1, _analysis_request("AC", n_points=1, f_start=1000.0, f_end=1000.0))
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="transformer-ratio")

    sec_signal = next(s for s in result.signals if s.name.lower() == "v(sec_hi)")
    ratio = abs(complex(sec_signal.data[0]))
    assert abs(ratio - 5.0) / 5.0 < 0.05  # within 5%
