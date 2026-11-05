"""Round-trips real .gsim_sch v2 fixtures and the schema's own worked
example through the hand-written pydantic models, so schema drift (a field
added/renamed in gsim_sch.schema.json without a matching model update)
fails loudly here instead of silently producing wrong AI-facing behavior.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from gsim_model import GsimSchDocument

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
SCHEMA_PATH = (
    REPO_ROOT / "packages" / "schemas" / "definitions" / "model" / "gsim_sch.schema.json"
)

FIXTURES = [
    REPO_ROOT / "docs" / "circuit_test" / "buck_converter" / "buck_converter.gsim_sch",
    REPO_ROOT / "tests" / "manual-tests" / "simulation" / "rec_circuit.gsim_sch",
]


def test_schema_file_exists() -> None:
    assert SCHEMA_PATH.exists()


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda p: p.name)
def test_real_fixture_round_trips(fixture: pathlib.Path) -> None:
    if not fixture.exists():
        pytest.skip(f"fixture not present: {fixture}")
    raw = json.loads(fixture.read_text(encoding="utf-8"))

    doc = GsimSchDocument.load(raw)
    dumped = doc.to_raw_dict()

    # Every block/wire id that was present in the source file must survive
    # the pydantic round-trip unchanged.
    assert {b["id"] for b in raw["model"]["blocks"]} == {
        b["id"] for b in dumped["model"]["blocks"]
    }
    assert {w["id"] for w in raw["model"]["wires"]} == {w["id"] for w in dumped["model"]["wires"]}


def test_jsonschema_validates_our_dump() -> None:
    # Built directly rather than from a docs/circuit_test fixture: the real
    # buck_converter.gsim_sch fixture's TRAN analysis uses `n_samples`
    # instead of the schema-required `t_step` (pre-existing drift between
    # that fixture and gsim_sch.schema.json, unrelated to gsim_model).
    import jsonschema

    from gsim_model import ModelBuilder

    b = ModelBuilder.new("m1", "Test")
    r1 = b.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        position=(0, 0),
        label="R1",
    )
    r2 = b.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        position=(10, 0),
    )
    b.connect(r1.port("p2"), r2.port("p1"), kind="physical-electrical")

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.validate(b.document.to_raw_dict(), schema)
