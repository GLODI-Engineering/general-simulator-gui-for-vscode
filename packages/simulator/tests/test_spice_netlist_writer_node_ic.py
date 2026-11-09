"""Node initial conditions per writer target.

For the general-simulator target a ``kind == "node"`` initial condition is folded
into the ``IC=`` field of the capacitor(s) attached to the net, following
general-mna's convention that a capacitor's ``ic`` is the voltage of its first
node minus its second. Every other target keeps the ``.IC`` card.

This is **not** because ``.IC`` is unsupported. general-simulator#11, which
dropped the card silently, is fixed, and `.IC V(out)=5` now gives output
identical to `C1 ... ic=5`. Folding is kept because it makes the one case the
engine is quiet about visible: an ``.IC`` on a net with no state element is
accepted and has no effect, and the fold turns that into a warning here.
"""

from __future__ import annotations

import pytest

from simulator.compiler.spice_netlist_writer import (
    TARGET_GENERAL_SIMULATOR,
    NodeICConflictError,
    write_netlist,
)
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph, IR1Net, IR1SimulationDirective
from simulator.solvers.protocol import AnalysisRequest

_TRAN = AnalysisRequest(
    id="tran1", type="TRAN", params={"t_end": 1e-5, "t_step": 1e-5}, sweeps=[], solver_options={}
)


def _block(instance_id: str, kind: str, **params: object) -> IR1Block:
    return IR1Block(
        instance_id=instance_id,
        block_type=f"physical-electrical.{kind}",
        paradigm="physical-network",
        domain="physical-electrical",
        fidelity="ideal",
        params=dict(params),
    )


def _wire(src: tuple[str, str], dst: tuple[str, str], net: str) -> IR1Connection:
    return IR1Connection(src=src, dst=dst, kind="physical-electrical", net=net)


def _net(name: str, *, ground: bool = False) -> IR1Net:
    return IR1Net(name=name, kind="physical-electrical", scope="model", is_reference=ground)


def _rc_to_ground(node_ics: list[dict[str, object]], **cap_params: object) -> IR1Graph:
    """The issue's reproduction: ``V1 a 0 10 / R1 a b 1000 / C1 b 0 1e-6``."""
    return IR1Graph(
        blocks=[
            _block("v1", "source.voltage_dc", V=10.0),
            _block("r1", "passive.resistor", R=1000.0),
            _block("c1", "passive.capacitor", C=1e-6, **cap_params),
        ],
        connections=[
            _wire(("v1", "p"), ("r1", "p"), "a"),
            _wire(("r1", "n"), ("c1", "p"), "b"),
            _wire(("c1", "n"), ("v1", "n"), "gnd"),
        ],
        nets=[_net("a"), _net("b"), _net("gnd", ground=True)],
        simulation=IR1SimulationDirective(initial_conditions=node_ics),
    )


def _capacitor_line(netlist: str, instance_id: str = "c1") -> str:
    return next(line for line in netlist.splitlines() if line.startswith(f"C{instance_id}"))


def test_ground_referenced_capacitor_carries_the_node_ic() -> None:
    ir1 = _rc_to_ground([{"kind": "node", "name": "b", "value": 5}])

    netlist = write_netlist(ir1, _TRAN, target=TARGET_GENERAL_SIMULATOR)

    assert _capacitor_line(netlist) == "Cc1 b 0 1e-06 IC=5"
    assert ".IC" not in netlist


def test_ground_as_first_node_negates_the_node_ic() -> None:
    ir1 = _rc_to_ground([{"kind": "node", "name": "b", "value": 5}])
    # Flip the capacitor so ground is its first node: ic = V(0) - V(b) = -5.
    ir1.connections[1] = _wire(("r1", "n"), ("c1", "n"), "b")
    ir1.connections[2] = _wire(("c1", "p"), ("v1", "n"), "gnd")

    netlist = write_netlist(ir1, _TRAN, target=TARGET_GENERAL_SIMULATOR)

    assert _capacitor_line(netlist) == "Cc1 0 b 1e-06 IC=-5"


def test_capacitor_between_two_nets_gets_the_difference() -> None:
    ir1 = IR1Graph(
        blocks=[
            _block("v1", "source.voltage_dc", V=10.0),
            _block("r1", "passive.resistor", R=1000.0),
            _block("c1", "passive.capacitor", C=1e-6),
            _block("r2", "passive.resistor", R=1000.0),
        ],
        connections=[
            _wire(("v1", "p"), ("r1", "p"), "a"),
            _wire(("r1", "n"), ("c1", "p"), "b"),
            _wire(("c1", "n"), ("r2", "p"), "c"),
            _wire(("r2", "n"), ("v1", "n"), "gnd"),
        ],
        nets=[_net("a"), _net("b"), _net("c"), _net("gnd", ground=True)],
        simulation=IR1SimulationDirective(
            initial_conditions=[
                {"kind": "node", "name": "b", "value": 7.5},
                {"kind": "node", "name": "c", "value": 2.5},
            ]
        ),
    )

    netlist = write_netlist(ir1, _TRAN, target=TARGET_GENERAL_SIMULATOR)

    # general-mna: ic = V(first node) - V(second node) = V(b) - V(c).
    assert _capacitor_line(netlist) == "Cc1 b c 1e-06 IC=5"
    assert ".IC" not in netlist


def test_matching_element_ic_is_left_alone() -> None:
    ir1 = _rc_to_ground([{"kind": "node", "name": "b", "value": 5}], IC=5)

    netlist = write_netlist(ir1, _TRAN, target=TARGET_GENERAL_SIMULATOR)

    assert _capacitor_line(netlist) == "Cc1 b 0 1e-06 IC=5"


def test_conflicting_element_ic_names_both_values() -> None:
    ir1 = _rc_to_ground([{"kind": "node", "name": "b", "value": 5}], IC=3)

    with pytest.raises(NodeICConflictError) as excinfo:
        write_netlist(ir1, _TRAN, target=TARGET_GENERAL_SIMULATOR)

    message = str(excinfo.value)
    assert "'c1'" in message
    assert "IC=3" in message
    assert "V(b)=5" in message


def test_net_without_capacitor_warns_instead_of_emitting_ic_card() -> None:
    ir1 = _rc_to_ground([{"kind": "node", "name": "a", "value": 10}])

    with pytest.warns(
        UserWarning, match=r"V\(a\)=10 has no effect.*no capacitor is attached to net 'a'"
    ):
        netlist = write_netlist(ir1, _TRAN, target=TARGET_GENERAL_SIMULATOR)

    assert ".IC" not in netlist
    assert "IC=" not in _capacitor_line(netlist)


def test_capacitor_whose_other_terminal_floats_does_not_cover_the_net() -> None:
    # C1 sits between b and c; only b has a node IC, so V(c) is unknown and
    # the capacitor voltage is undetermined — warn rather than guess.
    ir1 = IR1Graph(
        blocks=[
            _block("c1", "passive.capacitor", C=1e-6),
            _block("r1", "passive.resistor", R=1000.0),
        ],
        connections=[
            _wire(("c1", "n"), ("r1", "p"), "c"),
            _wire(("r1", "n"), ("c1", "p"), "b"),
        ],
        nets=[_net("b"), _net("c")],
        simulation=IR1SimulationDirective(
            initial_conditions=[{"kind": "node", "name": "b", "value": 1}]
        ),
    )

    with pytest.warns(UserWarning, match=r"V\(b\)=1 has no effect"):
        netlist = write_netlist(ir1, _TRAN, target=TARGET_GENERAL_SIMULATOR)

    assert "IC=" not in _capacitor_line(netlist)


def test_default_spice_target_still_emits_ic_card() -> None:
    ir1 = _rc_to_ground([{"kind": "node", "name": "b", "value": 5}])

    netlist = write_netlist(ir1, _TRAN)

    assert ".IC V(b)=5" in netlist
    assert _capacitor_line(netlist) == "Cc1 b 0 1e-06"


def test_unknown_target_is_rejected() -> None:
    ir1 = _rc_to_ground([])

    with pytest.raises(ValueError, match="Unknown netlist target"):
        write_netlist(ir1, _TRAN, target="not-a-real-target")


# ---------------------------------------------------------------------------
# Why the fold is still right
# ---------------------------------------------------------------------------


def test_the_fold_says_the_same_thing_as_the_card_it_replaces() -> None:
    """The two targets describe one circuit, spelled two ways.

    Measured against the release CLI, not assumed: on an RC with
    ``C1 out 0 1e-6``, ``.IC V(out)=5`` and ``C1 ... ic=5`` produce identical
    transient output to the last digit. So folding a node IC onto the capacitor
    is a change of spelling, and the general-simulator and spice targets cannot
    disagree about what they asked for.

    This pins the writer half. The engine half, and the commands that showed it,
    are recorded beside ``TARGET_SPICE`` in ``spice_netlist_writer.py`` — the
    point being that the fold is kept for the diagnostics it enables, not
    because ``.IC`` is unsupported. It is supported.
    """
    node_ic = [{"kind": "node", "name": "b", "value": 5}]

    folded = write_netlist(_rc_to_ground(node_ic), _TRAN, target=TARGET_GENERAL_SIMULATOR)
    assert _capacitor_line(folded) == "Cc1 b 0 1e-06 IC=5"
    assert ".IC" not in folded

    carded = write_netlist(_rc_to_ground(node_ic), _TRAN, target="spice")
    assert ".IC V(b)=5" in carded
    assert "IC=" not in _capacitor_line(carded)
