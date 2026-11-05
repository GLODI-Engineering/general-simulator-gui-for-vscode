from __future__ import annotations

import pytest

from simulator.compiler.spice_netlist_writer import UnsupportedBlockError, write_netlist
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph, IR1Net, IR1SimulationDirective
from simulator.solvers.protocol import AnalysisRequest


def _analysis_request(kind: str, **params: float | int | str | bool) -> AnalysisRequest:
    return AnalysisRequest(
        id=f"{kind.lower()}1",
        type=kind,
        params=dict(params),
        sweeps=[],
        solver_options={},
    )


def _count_analysis_cards(netlist: str) -> int:
    cards = (".OP", ".TRAN", ".AC", ".DC")
    return sum(1 for line in netlist.splitlines() if line.startswith(cards))


def test_named_nets() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="v1",
                block_type="physical-electrical.source.voltage_dc",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"V": 1.0},
            ),
            IR1Block(
                instance_id="r1",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"R": 1000.0},
            ),
            IR1Block(
                instance_id="c1",
                block_type="physical-electrical.passive.capacitor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"C": 1e-6},
            ),
        ],
        connections=[
            IR1Connection(src=("v1", "p"), dst=("r1", "p"), kind="physical-electrical", net="vin"),
            IR1Connection(src=("r1", "n"), dst=("c1", "p"), kind="physical-electrical", net="vout"),
            IR1Connection(src=("c1", "n"), dst=("v1", "n"), kind="physical-electrical", net="gnd"),
        ],
        nets=[
            IR1Net(name="vin", kind="physical-electrical", scope="model"),
            IR1Net(name="vout", kind="physical-electrical", scope="model"),
            IR1Net(name="gnd", kind="physical-electrical", scope="model", is_reference=True),
        ],
        simulation=IR1SimulationDirective(
            initial_conditions=[{"kind": "node", "name": "vout", "value": 0}]
        ),
    )

    netlist = write_netlist(ir1, _analysis_request("OP"))

    assert "V(vout)" in netlist
    assert "V(net1)" not in netlist


def test_param_emission() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="rload",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"R": "Rload"},
            )
        ],
        params={"Rload": 1000},
    )

    netlist = write_netlist(ir1, _analysis_request("OP"))

    assert ".PARAM Rload=1000" in netlist
    resistor_line = next(line for line in netlist.splitlines() if line.startswith("R"))
    assert "R={Rload}" in resistor_line


def test_node_ic() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="r1",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"R": 1000.0},
            )
        ],
        simulation=IR1SimulationDirective(
            initial_conditions=[{"kind": "node", "name": "vout", "value": 0}]
        ),
    )

    netlist = write_netlist(ir1, _analysis_request("OP"))

    assert ".IC V(vout)=0" in netlist


def test_capacitor_ic() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="c1",
                block_type="physical-electrical.passive.capacitor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"C": 1e-6},
                ic={"v": 0.5},
            )
        ]
    )

    netlist = write_netlist(ir1, _analysis_request("TRAN", t_end=1e-3, t_step=1e-6))

    capacitor_line = next(line for line in netlist.splitlines() if line.startswith("C"))
    assert "IC=0.5" in capacitor_line


def test_multi_analysis() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="r1",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
                params={"R": 1000.0},
            )
        ]
    )

    op_netlist = write_netlist(ir1, _analysis_request("OP"))
    tran_netlist = write_netlist(ir1, _analysis_request("TRAN", t_end=1e-3, t_step=1e-6))

    assert op_netlist != tran_netlist

    assert _count_analysis_cards(op_netlist) == 1
    assert ".OP" in op_netlist
    assert ".TRAN" not in op_netlist

    assert _count_analysis_cards(tran_netlist) == 1
    assert ".TRAN" in tran_netlist
    assert ".OP" not in tran_netlist


def test_unsupported_pair() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="m1",
                block_type="physical-electrical.semiconductor.mosfet_n",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="spice",
                params={"W": 1e-6, "L": 180e-9},
            )
        ]
    )

    with pytest.raises(
        UnsupportedBlockError,
        match=r"physical-electrical\.semiconductor\.mosfet_n",
    ):
        write_netlist(ir1, _analysis_request("OP"))
