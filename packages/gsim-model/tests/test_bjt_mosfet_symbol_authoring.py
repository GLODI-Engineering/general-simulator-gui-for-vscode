"""BE-74: real bjt_npn / mosfet_n catalog symbols authored with the GSF
component-creator API — parity/validity checks for the merged metadata.yaml
under packages/blocks."""

from __future__ import annotations

import json
import pathlib
import sys

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_SCRIPTS_DIR = _REPO_ROOT / "packages" / "gsim-model" / "scripts"
_BLOCKS_ROOT = _REPO_ROOT / "packages" / "blocks" / "src" / "blocks"
_SCHEMAS_DIR = _REPO_ROOT / "packages" / "schemas" / "definitions"

sys.path.insert(0, str(_SCRIPTS_DIR))
import author_bjt_mosfet_symbols as authoring  # noqa: E402


def _validator() -> Draft202012Validator:
    block_schema = json.loads((_SCHEMAS_DIR / "blocks" / "block-metadata.schema.json").read_text())
    port_kind_schema = json.loads((_SCHEMAS_DIR / "model" / "port-kind.schema.json").read_text())
    registry = Registry().with_resource(
        "https://general-simulator.dev/schemas/model/port-kind.schema.json",
        Resource.from_contents(port_kind_schema),
    )
    return Draft202012Validator(block_schema, registry=registry)


def test_bjt_npn_metadata_validates() -> None:
    path = _BLOCKS_ROOT / "physical-electrical" / "semiconductor" / "bjt_npn" / "metadata.yaml"
    data = yaml.safe_load(path.read_text())
    assert data["symbol"]["shape"] == "primitives"
    errors = list(_validator().iter_errors(data))
    assert errors == [], [e.message for e in errors]


def test_mosfet_n_metadata_validates() -> None:
    path = _BLOCKS_ROOT / "physical-electrical" / "semiconductor" / "mosfet_n" / "metadata.yaml"
    data = yaml.safe_load(path.read_text())
    assert data["symbol"]["shape"] == "primitives"
    errors = list(_validator().iter_errors(data))
    assert errors == [], [e.message for e in errors]


def test_authoring_script_is_deterministic(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from gsim_model.gsim_sym import merge_into_catalog

    root_a = tmp_path / "a"
    root_b = tmp_path / "b"
    path_a = merge_into_catalog(authoring.build_bjt_npn(), root_a)
    path_b = merge_into_catalog(authoring.build_bjt_npn(), root_b)
    assert path_a.read_text() == path_b.read_text()

    path_a2 = merge_into_catalog(authoring.build_mosfet_n(), root_a)
    path_b2 = merge_into_catalog(authoring.build_mosfet_n(), root_b)
    assert path_a2.read_text() == path_b2.read_text()


def test_bjt_ports_unchanged() -> None:
    path = _BLOCKS_ROOT / "physical-electrical" / "semiconductor" / "bjt_npn" / "metadata.yaml"
    data = yaml.safe_load(path.read_text())
    ports = data["ports"]
    assert ports["inputs"] == [
        {"id": "b", "label": "B", "kind": {"domain": "physical-electrical"}, "side": "left", "offset": 41}
    ]
    output_ids = {p["id"]: (p["side"], p["offset"]) for p in ports["outputs"]}
    assert output_ids == {"c": ("top", 46), "e": ("bottom", 46)}


def test_mosfet_n_ports_unchanged() -> None:
    path = _BLOCKS_ROOT / "physical-electrical" / "semiconductor" / "mosfet_n" / "metadata.yaml"
    data = yaml.safe_load(path.read_text())
    ports = data["ports"]
    assert ports["inputs"] == [
        {"id": "g", "label": "G", "kind": {"domain": "physical-electrical"}, "side": "left", "offset": 81}
    ]
    output_ids = {p["id"]: (p["side"], p["offset"]) for p in ports["outputs"]}
    assert output_ids == {"d": ("top", 51), "s": ("bottom", 51)}
