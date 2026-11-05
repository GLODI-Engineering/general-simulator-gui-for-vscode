"""FE-46 - Passive block metadata tests."""

from __future__ import annotations

import pathlib

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parents[3]
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks" / "passive"

PASSIVE_BLOCKS: dict[str, str] = {
    "resistor": "passive.resistor",
    "resistor_behavioral": "passive.resistor.behavioral",
    "resistor_semiconductor": "passive.resistor.semiconductor",
    "capacitor": "passive.capacitor",
    "capacitor_behavioral": "passive.capacitor.behavioral",
    "capacitor_semiconductor": "passive.capacitor.semiconductor",
    "inductor": "passive.inductor",
    "inductor_behavioral": "passive.inductor.behavioral",
    "inductor_coupled": "passive.inductor.coupled",
    "switch_voltage": "passive.switch.voltage",
    "switch_current": "passive.switch.current",
    "switch_generic": "passive.switch.generic",
    "memristor": "passive.memristor",
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
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("subdir,expected_name", list(PASSIVE_BLOCKS.items()))
def test_passive_block_exists(subdir: str, expected_name: str) -> None:
    path = BLOCKS_ROOT / subdir / "metadata.yaml"
    assert path.exists(), f"Missing metadata.yaml for {expected_name} at {path}"


@pytest.mark.parametrize("subdir,expected_name", list(PASSIVE_BLOCKS.items()))
def test_passive_block_required_shape(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    assert data["name"] == expected_name
    assert data["category"] == "passive"
    for key in REQUIRED_TOP_LEVEL:
        assert key in data, f"{expected_name}: missing required top-level key '{key}'"
    for key in REQUIRED_BEHAVIOR:
        assert key in data["behavior"], f"{expected_name}: missing behavior key '{key}'"


def test_passive_switch_generic_description_mentions_xyce() -> None:
    description = _load_metadata("switch_generic").get("description", "")
    assert "xyce" in description.lower()


def test_passive_memristor_description_mentions_xyce() -> None:
    description = _load_metadata("memristor").get("description", "")
    assert "xyce" in description.lower()
