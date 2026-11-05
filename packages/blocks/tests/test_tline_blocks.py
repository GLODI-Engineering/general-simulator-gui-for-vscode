"""FE-49 — Transmission line block metadata tests.

Acceptance bullets:
- Python test loads and schema-validates all 5 TL metadata.yaml files.
- Python test confirms tline.lossless has params Z0 and TD.
- Python test confirms tline.lumped and tline.linear_device descriptions contain "Xyce" or "xyce".
- Frontend catalog name presence checked in catalog.test.ts.
"""

from __future__ import annotations

import pathlib

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parents[3]
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks" / "tline"

TLINE_BLOCKS: dict[str, str] = {
    "lossless": "tline.lossless",
    "lossy": "tline.lossy",
    "urc": "tline.urc",
    "lumped": "tline.lumped",
    "linear_device": "tline.linear_device",
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


@pytest.mark.parametrize("subdir,expected_name", list(TLINE_BLOCKS.items()))
def test_tline_block_exists(subdir: str, expected_name: str) -> None:
    path = BLOCKS_ROOT / subdir / "metadata.yaml"
    assert path.exists(), f"Missing metadata.yaml for {expected_name}"


@pytest.mark.parametrize("subdir,expected_name", list(TLINE_BLOCKS.items()))
def test_tline_block_name(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    assert data["name"] == expected_name


@pytest.mark.parametrize("subdir,expected_name", list(TLINE_BLOCKS.items()))
def test_tline_block_category(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    assert data["category"] == "tline", (
        f"{expected_name}: expected category 'tline', got '{data['category']}'"
    )


# ---------------------------------------------------------------------------
# Structural validation (mirrors block-metadata.schema.json required fields)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir,expected_name", list(TLINE_BLOCKS.items()))
def test_tline_block_required_top_level_keys(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    for key in REQUIRED_TOP_LEVEL:
        assert key in data, f"{expected_name}: missing required top-level key '{key}'"


@pytest.mark.parametrize("subdir,expected_name", list(TLINE_BLOCKS.items()))
def test_tline_block_required_behavior_keys(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    behavior = data.get("behavior", {})
    for key in REQUIRED_BEHAVIOR:
        assert key in behavior, f"{expected_name}: missing required behavior key '{key}'"


# ---------------------------------------------------------------------------
# FE-49 acceptance bullet: tline.lossless has params Z0 and TD
# ---------------------------------------------------------------------------


def test_lossless_has_z0_and_td() -> None:
    data = _load_metadata("lossless")
    param_names = {p["name"] for p in data["params"]}
    assert "Z0" in param_names, "tline.lossless missing param 'Z0'"
    assert "TD" in param_names, "tline.lossless missing param 'TD'"


# ---------------------------------------------------------------------------
# FE-49 acceptance bullet: all TL blocks have 4 ports (a1, b1, a2, b2)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir,expected_name", list(TLINE_BLOCKS.items()))
def test_tline_has_four_ports(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    port_ids = _all_port_ids(data)
    assert len(port_ids) == 4, f"{expected_name}: expected 4 ports, got {port_ids}"
    for expected_id in ("a1", "b1", "a2", "b2"):
        assert expected_id in port_ids, f"{expected_name}: missing port '{expected_id}'"


# ---------------------------------------------------------------------------
# FE-49 acceptance bullet: lumped and linear_device mention Xyce
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir", ["lumped", "linear_device"])
def test_xyce_only_tline_description(subdir: str) -> None:
    data = _load_metadata(subdir)
    desc = data.get("description", "")
    assert "xyce" in desc.lower(), (
        f"tline.{subdir} description should mention 'Xyce' or 'xyce', got: {desc!r}"
    )
