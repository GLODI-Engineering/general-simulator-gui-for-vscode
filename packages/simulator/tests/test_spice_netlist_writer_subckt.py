"""BE-59 — SPICE netlist emission for SubcktDef/SubcktInstance.

Covers:
- A SubcktDef referenced by multiple spice-subckt.instance blocks is emitted
  exactly once as .SUBCKT/.ENDS, with one X-card per instance.
- A SubcktDef with a non-empty instances[] emits its own nested X-card(s)
  inside its .SUBCKT body, referencing the nested def by name.
- Integration (skipped if ngspice not on host): the emitted netlist for a
  custom two-resistor-divider subckt, instantiated twice, is accepted by a
  real ngspice subprocess run.
"""

from __future__ import annotations

import pathlib

import pytest

from simulator.compiler.spice_netlist_writer import write_netlist
from simulator.ir.ir1 import (
    IR1Block,
    IR1Connection,
    IR1Graph,
    IR1SubcktDef,
    IR1SubcktInstance,
    IR1SubcktPort,
)
from simulator.solvers.protocol import AnalysisRequest


def _analysis_request(kind: str, **params: float | int | str | bool) -> AnalysisRequest:
    return AnalysisRequest(
        id=f"{kind.lower()}1", type=kind, params=dict(params), sweeps=[], solver_options={}
    )


_DIVIDER_DEF = IR1SubcktDef(
    id="divider",
    name="DIVIDER",
    ports=[
        IR1SubcktPort(id="in", kind="physical-electrical"),
        IR1SubcktPort(id="out", kind="physical-electrical"),
        IR1SubcktPort(id="gnd", kind="physical-electrical"),
    ],
    body="R1 in out 1k\nR2 out gnd 1k",
)


def _instance_block(instance_id: str, def_ref: str) -> IR1Block:
    return IR1Block(
        instance_id=instance_id,
        block_type="spice-subckt.instance",
        paradigm="spice-subckt",
        domain="physical-electrical",
        fidelity="spice",
        params={"def_ref": def_ref},
    )


def _voltage_source(instance_id: str, v: float) -> IR1Block:
    return IR1Block(
        instance_id=instance_id,
        block_type="physical-electrical.source.voltage_dc",
        paradigm="physical-network",
        domain="physical-electrical",
        fidelity="ideal",
        params={"V": v},
    )


def _divider_chain_graph() -> IR1Graph:
    return IR1Graph(
        blocks=[_voltage_source("v1", 5.0), _instance_block("x1", "divider"), _instance_block("x2", "divider")],
        connections=[
            IR1Connection(src=("v1", "p"), dst=("x1", "in"), kind="physical-electrical", net="vin"),
            IR1Connection(src=("v1", "n"), dst=("x1", "gnd"), kind="physical-electrical", net="0"),
            IR1Connection(src=("v1", "n"), dst=("x2", "gnd"), kind="physical-electrical", net="0"),
            IR1Connection(src=("x1", "out"), dst=("x2", "in"), kind="physical-electrical", net="mid"),
        ],
        subckt_defs=[_DIVIDER_DEF],
    )


def test_subckt_emitted_once_for_multiple_instances() -> None:
    netlist = write_netlist(_divider_chain_graph(), _analysis_request("OP"))

    assert netlist.count(".SUBCKT DIVIDER") == 1
    assert netlist.count(".ENDS DIVIDER") == 1
    x_cards = [line for line in netlist.splitlines() if line.startswith("X") and "DIVIDER" in line]
    assert len(x_cards) == 2


def test_subckt_instance_nets_match_wires() -> None:
    netlist = write_netlist(_divider_chain_graph(), _analysis_request("OP"))
    lines = netlist.splitlines()

    x1_line = next(line for line in lines if line.startswith("Xx1"))
    # Xx1 <in-net> <out-net> <gnd-net> DIVIDER, in declared port order.
    parts = x1_line.split()
    assert parts[0] == "Xx1"
    assert parts[-1] == "DIVIDER"
    assert parts[1] == "vin"
    assert parts[3] == "0"


def test_nested_subckt_defs_emit_inner_x_card() -> None:
    leaf = IR1SubcktDef(
        id="leaf",
        name="LEAF",
        ports=[IR1SubcktPort(id="a", kind="physical-electrical"), IR1SubcktPort(id="b", kind="physical-electrical")],
        body="R1 a b 1k",
    )
    wrapper = IR1SubcktDef(
        id="wrapper",
        name="WRAPPER",
        ports=[IR1SubcktPort(id="p", kind="physical-electrical"), IR1SubcktPort(id="n", kind="physical-electrical")],
        instances=[IR1SubcktInstance(id="Xinner", def_ref="leaf", connections=["p", "n"])],
    )
    graph = IR1Graph(
        blocks=[_instance_block("w1", "wrapper")],
        connections=[],
        subckt_defs=[leaf, wrapper],
    )

    netlist = write_netlist(graph, _analysis_request("OP"))

    wrapper_body = netlist.split(".SUBCKT WRAPPER")[1].split(".ENDS WRAPPER")[0]
    assert "XXinner p n LEAF" in wrapper_body
    assert ".SUBCKT LEAF a b" in netlist
    assert netlist.count(".SUBCKT LEAF") == 1


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_divider_chain_runs_on_real_ngspice(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    netlist = write_netlist(_divider_chain_graph(), _analysis_request("TRAN", t_end=1e-3, t_step=1e-4))

    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="subckt-int")

    signal_names = [s.name for s in result.signals]
    assert any("mid" in n for n in signal_names), (
        f"Expected a V(mid) signal from the divider chain, got: {signal_names}"
    )
