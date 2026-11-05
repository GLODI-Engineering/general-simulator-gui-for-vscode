"""gsim_model.gsim_sym — .gsim_sym file I/O + catalog merge (BE-73)."""

from __future__ import annotations

import json
import pathlib

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from gsim_model.catalog import load_symbol_geometry
from gsim_model.gsim_sym import load_gsim_sym, merge_into_catalog, save_gsim_sym
from gsim_model.symbol import Circle, ComponentDefinition, Rect, SymbolBuilder

_SCHEMAS_DIR = pathlib.Path(__file__).resolve().parents[3] / "packages" / "schemas" / "definitions"


def _block_metadata_validator() -> Draft202012Validator:
    block_schema = json.loads((_SCHEMAS_DIR / "blocks" / "block-metadata.schema.json").read_text())
    port_kind_schema = json.loads((_SCHEMAS_DIR / "model" / "port-kind.schema.json").read_text())
    registry = Registry().with_resource(
        "https://general-simulator.dev/schemas/model/port-kind.schema.json",
        Resource.from_contents(port_kind_schema),
    )
    return Draft202012Validator(block_schema, registry=registry)


def _widget(name: str = "physical_electrical.test.widget") -> ComponentDefinition:
    b = SymbolBuilder(bbox=(20, 20))
    b.add(Rect(x=0, y=0, w=20, h=20))
    b.add(Circle(cx=10, cy=10, r=4))
    b.port("p", side="left", offset=10, kind="physical-electrical", direction="input")
    b.port("n", side="right", offset=10, kind="physical-electrical", direction="output")
    return ComponentDefinition(
        name=name,
        type="physical-electrical.test.widget",
        label="Widget",
        version=1,
        category="passive",
        description="A test widget.",
        paradigm="physical-network",
        domain="physical-electrical",
        symbol_builder=b,
        fidelities=[{"tier": "n_a", "doc": "single tier"}],
    )


def test_save_load_round_trip(tmp_path) -> None:  # type: ignore[no-untyped-def]
    comp = _widget()
    path = tmp_path / "widget.gsim_sym"
    save_gsim_sym(comp, path)

    reloaded = load_gsim_sym(path)

    assert reloaded.to_dict() == comp.to_dict()


def test_save_is_canonical_and_deterministic(tmp_path) -> None:  # type: ignore[no-untyped-def]
    comp = _widget()
    path_a = tmp_path / "a.gsim_sym"
    path_b = tmp_path / "b.gsim_sym"
    save_gsim_sym(comp, path_a)
    save_gsim_sym(comp, path_b)
    assert path_a.read_text() == path_b.read_text()
    # Sanity: it really is JSON, sorted-key.
    data = json.loads(path_a.read_text())
    assert data["name"] == "physical_electrical.test.widget"


def test_merge_into_catalog_writes_expected_path(tmp_path) -> None:  # type: ignore[no-untyped-def]
    comp = _widget()
    written = merge_into_catalog(comp, tmp_path)
    assert written == tmp_path / "physical-electrical" / "test" / "widget" / "metadata.yaml"
    assert written.exists()


def test_merge_into_catalog_overwrite_preserves_validity(tmp_path) -> None:  # type: ignore[no-untyped-def]
    comp_v1 = _widget()
    merge_into_catalog(comp_v1, tmp_path)

    b2 = SymbolBuilder(bbox=(40, 40))
    b2.add(Rect(x=0, y=0, w=40, h=40))
    b2.port("p", side="left", offset=20, kind="physical-electrical", direction="input")
    b2.port("n", side="right", offset=20, kind="physical-electrical", direction="output")
    comp_v2 = ComponentDefinition(
        name="physical_electrical.test.widget",
        type="physical-electrical.test.widget",
        label="Widget v2",
        version=1,
        category="passive",
        description="Updated widget.",
        paradigm="physical-network",
        domain="physical-electrical",
        symbol_builder=b2,
        fidelities=[{"tier": "n_a", "doc": "single tier"}],
    )
    merge_into_catalog(comp_v2, tmp_path)

    geom = load_symbol_geometry("physical-electrical.test.widget", blocks_root=tmp_path)
    assert geom.bbox == (40, 40)


def test_merged_metadata_validates_against_schema(tmp_path) -> None:  # type: ignore[no-untyped-def]
    comp = _widget()
    written = merge_into_catalog(comp, tmp_path)
    data = yaml.safe_load(written.read_text())

    validator = _block_metadata_validator()
    errors = list(validator.iter_errors(data))
    assert errors == [], [e.message for e in errors]
