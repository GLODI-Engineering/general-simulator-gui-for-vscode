"""BE-63 — spice_netlist_writer.compute_node_domains.

Covers a document containing both a real electrical net and a
signal-flow-origin net, proving both classifications coexist correctly
side by side in one graph (not just in isolation).
"""

from __future__ import annotations

from simulator.compiler.spice_netlist_writer import compute_node_domains
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph


def test_mixed_electrical_and_signal_domains() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="r1",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
            ),
            IR1Block(
                instance_id="r2",
                block_type="physical-electrical.passive.resistor",
                paradigm="physical-network",
                domain="physical-electrical",
                fidelity="ideal",
            ),
            IR1Block(
                instance_id="gain1",
                block_type="signal-flow.math.gain",
                paradigm="signal-flow",
                domain="signal",
                fidelity="n_a",
                params={"k": 2.0},
            ),
        ],
        connections=[
            IR1Connection(
                src=("r1", "p2"), dst=("r2", "p1"), kind="physical-electrical", net="elec_net"
            ),
            IR1Connection(src=("gain1", "in"), dst=("gain1", "out"), kind="signal", net="sig_net"),
        ],
    )

    domains = compute_node_domains(ir1)

    assert domains["elec_net"] == "physical-electrical"
    assert domains["sig_net"] == "signal"


def test_unconnected_port_falls_back_to_block_domain() -> None:
    ir1 = IR1Graph(
        blocks=[
            IR1Block(
                instance_id="gain1",
                block_type="signal-flow.math.gain",
                paradigm="signal-flow",
                domain="signal",
                fidelity="n_a",
                params={"k": 2.0},
            ),
        ],
        connections=[],
    )

    domains = compute_node_domains(ir1)

    # gain1's ports are entirely unwired — must still resolve to the
    # block's own declared domain, not silently vanish.
    assert set(domains.values()) == {"signal"}
