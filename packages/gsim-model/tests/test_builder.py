from __future__ import annotations

import pydantic
import pytest

from gsim_model import DanglingWireError, DuplicateIdError, ModelBuilder


def _resistor(builder: ModelBuilder, **kw):
    return builder.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        fidelity="ideal",
        **kw,
    )


def test_add_block_and_connect() -> None:
    b = ModelBuilder.new("m1", "Test")
    r1 = _resistor(b, position=(0, 0), params={"R": "1k"})
    r2 = _resistor(b, position=(100, 0), params={"R": "2k"})
    wire = b.connect(r1.port("p2"), r2.port("p1"), kind="physical-electrical")

    assert len(b.document.model.blocks) == 2
    assert b.document.model.wires == [wire]
    assert wire.from_.block == r1.id
    assert wire.to.block == r2.id


def test_auto_id_avoids_collision() -> None:
    b = ModelBuilder.new("m1", "Test")
    r1 = _resistor(b, position=(0, 0))
    r2 = _resistor(b, position=(10, 0))
    assert r1.id != r2.id


def test_duplicate_block_id_rejected() -> None:
    b = ModelBuilder.new("m1", "Test")
    _resistor(b, id="r1", position=(0, 0))
    with pytest.raises(DuplicateIdError):
        _resistor(b, id="r1", position=(10, 0))


def test_connect_to_unknown_block_rejected() -> None:
    b = ModelBuilder.new("m1", "Test")
    r1 = _resistor(b, id="r1", position=(0, 0))
    with pytest.raises(DanglingWireError):
        b.connect(r1.port("p2"), r1.port("p2").model_copy(update={"block": "ghost"}), kind="physical-electrical")


def test_remove_block_cascades_to_wires() -> None:
    b = ModelBuilder.new("m1", "Test")
    r1 = _resistor(b, id="r1", position=(0, 0))
    r2 = _resistor(b, id="r2", position=(10, 0))
    b.connect(r1.port("p2"), r2.port("p1"), kind="physical-electrical")
    assert len(b.document.model.wires) == 1

    b.remove_block("r1")
    assert [blk.id for blk in b.document.model.blocks] == ["r2"]
    assert b.document.model.wires == []


def test_invalid_block_id_pattern_rejected() -> None:
    b = ModelBuilder.new("m1", "Test")
    with pytest.raises(pydantic.ValidationError):
        _resistor(b, id="1-bad-id", position=(0, 0))
