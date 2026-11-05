"""BE-63 — confirms Wire.kind/NetEntry.kind (plain domain strings, e.g.
"signal" / "physical-electrical") survive ir1_builder.build() into
IR1Connection.kind / IR1Net.kind unchanged.

Note: BE-63 was originally scoped against a research claim that
Wire.kind/NetEntry.kind are PortKind *objects* (``{"domain": "signal"}``),
which would make ir1_builder.py's ``str(wire.get("kind", "signal"))``
stringify a dict incorrectly. Re-verified directly against
gsim_sch.schema.json for this epic: gsim_sch.schema.json's own inline
``$defs/PortKind`` is a plain string enum (the object-shaped PortKind used
in block metadata YAML lives in a separate, unrelated schema file,
port-kind.schema.json). So Wire.kind/NetEntry.kind really are plain
strings in the actual persisted .gsim_sch v2 format, and no bug exists
here — this test is a regression guard, not a bug-fix verification.
"""

from __future__ import annotations

from simulator.compiler.ir1_builder import build


def _minimal_model(wire_kind: str, net_kind: str) -> dict:
    return {
        "model": {
            "id": "m1",
            "name": "Test",
            "grid": 10,
            "params": [],
            "blocks": [
                {
                    "id": "gain1",
                    "type": "signal-flow.math.gain",
                    "paradigm": "signal-flow",
                    "domain": "signal",
                    "fidelity": "n_a",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {},
                    "ic": {},
                },
                {
                    "id": "gain2",
                    "type": "signal-flow.math.gain",
                    "paradigm": "signal-flow",
                    "domain": "signal",
                    "fidelity": "n_a",
                    "position": [10, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {},
                    "ic": {},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "gain1", "port": "out"},
                    "to": {"block": "gain2", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                    "net": "sig_net",
                    "kind": wire_kind,
                }
            ],
            "lines": [],
            "nets": [{"name": "sig_net", "kind": net_kind, "scope": "model"}],
            "simulation": {},
            "metadata": {},
        }
    }


def test_wire_and_net_kind_are_plain_domain_strings() -> None:
    graph = build(_minimal_model("signal", "signal"))

    assert graph.connections[0].kind == "signal"
    assert graph.nets[0].kind == "signal"


def test_physical_electrical_kind_survives_unchanged() -> None:
    graph = build(_minimal_model("physical-electrical", "physical-electrical"))

    assert graph.connections[0].kind == "physical-electrical"
    assert graph.nets[0].kind == "physical-electrical"
