"""FE-48 — Semiconductor block metadata tests.

Acceptance bullets:
- Python test loads and schema-validates all 10 semiconductor metadata.yaml files.
- Python test confirms MOSFET block has params W, L, M, model.
- Python test confirms BJT blocks have exactly 3 ports (C, B, E).
- Python test confirms MOSFET blocks have exactly 4 ports (D, G, S, B).
- Frontend catalog name presence checked in catalog.test.ts.
"""

from __future__ import annotations

import pathlib

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parents[3]
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks" / "semiconductor"

SEMI_BLOCKS: dict[str, str] = {
    "diode": "semi.diode",
    "diode_zener": "semi.diode.zener",
    "bjt_npn": "semi.bjt.npn",
    "bjt_pnp": "semi.bjt.pnp",
    "jfet_n": "semi.jfet.n",
    "jfet_p": "semi.jfet.p",
    "mesfet_n": "semi.mesfet.n",
    "mosfet_n": "semi.mosfet.n",
    "mosfet_p": "semi.mosfet.p",
    "mosfet_vdmos": "semi.mosfet.vdmos",
}

REQUIRED_TOP_LEVEL = (
    "name",
    "label",
    "version",
    "category",
    "description",
    "ports",
    "params",
    "symbol",
    "behavior",
)
REQUIRED_BEHAVIOR = ("causality", "domain", "state_count", "equation_template")


def _load_metadata(subdir: str) -> dict:
    path = BLOCKS_ROOT / subdir / "metadata.yaml"
    return yaml.safe_load(path.read_text())


def _all_port_ids(data: dict) -> list[str]:
    ports = data.get("ports", {})
    ids = []
    for side in ("inputs", "outputs"):
        ids += [p["id"] for p in ports.get(side, [])]
    return ids


# ---------------------------------------------------------------------------
# Existence + name + category
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir,expected_name", list(SEMI_BLOCKS.items()))
def test_semi_block_exists(subdir: str, expected_name: str) -> None:
    path = BLOCKS_ROOT / subdir / "metadata.yaml"
    assert path.exists(), f"Missing metadata.yaml for {expected_name}"


@pytest.mark.parametrize("subdir,expected_name", list(SEMI_BLOCKS.items()))
def test_semi_block_name(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    assert data["name"] == expected_name


@pytest.mark.parametrize("subdir,expected_name", list(SEMI_BLOCKS.items()))
def test_semi_block_category(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    assert data["category"] == "semiconductor", (
        f"{expected_name}: expected category 'semiconductor', got '{data['category']}'"
    )


# ---------------------------------------------------------------------------
# Structural validation (mirrors block-metadata.schema.json required fields)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir,expected_name", list(SEMI_BLOCKS.items()))
def test_semi_block_required_top_level_keys(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    for key in REQUIRED_TOP_LEVEL:
        assert key in data, f"{expected_name}: missing required top-level key '{key}'"


@pytest.mark.parametrize("subdir,expected_name", list(SEMI_BLOCKS.items()))
def test_semi_block_required_behavior_keys(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    behavior = data.get("behavior", {})
    for key in REQUIRED_BEHAVIOR:
        assert key in behavior, f"{expected_name}: missing required behavior key '{key}'"


# ---------------------------------------------------------------------------
# FE-48 acceptance bullet: MOSFET has params W, L, M, model
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir", ["mosfet_n", "mosfet_p"])
def test_mosfet_has_required_params(subdir: str) -> None:
    data = _load_metadata(subdir)
    param_names = {p["name"] for p in data["params"]}
    for required in ("W", "L", "M", "model"):
        assert required in param_names, f"{subdir} missing param '{required}'"


# ---------------------------------------------------------------------------
# FE-48 acceptance bullet: BJT has exactly 3 ports (b, c, e)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir", ["bjt_npn", "bjt_pnp"])
def test_bjt_has_three_ports(subdir: str) -> None:
    data = _load_metadata(subdir)
    port_ids = _all_port_ids(data)
    assert len(port_ids) == 3, f"{subdir}: expected 3 ports, got {port_ids}"
    for expected_id in ("b", "c", "e"):
        assert expected_id in port_ids, f"{subdir}: missing port '{expected_id}'"


# ---------------------------------------------------------------------------
# FE-48 acceptance bullet: MOSFET has exactly 4 ports (d, g, s, b)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir", ["mosfet_n", "mosfet_p"])
def test_mosfet_has_four_ports(subdir: str) -> None:
    data = _load_metadata(subdir)
    port_ids = _all_port_ids(data)
    assert len(port_ids) == 4, f"{subdir}: expected 4 ports, got {port_ids}"
    for expected_id in ("d", "g", "s", "b"):
        assert expected_id in port_ids, f"{subdir}: missing port '{expected_id}'"


# ---------------------------------------------------------------------------
# FE-48 acceptance bullet: semi.diode.zener description notes ngspice-only
# ---------------------------------------------------------------------------


def test_diode_zener_description_mentions_ngspice() -> None:
    data = _load_metadata("diode_zener")
    desc = data.get("description", "")
    assert "ngspice" in desc.lower(), (
        f"semi.diode.zener description should mention 'ngspice', got: {desc!r}"
    )
