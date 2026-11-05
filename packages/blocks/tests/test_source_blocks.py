"""FE-47 — Source block metadata tests.

Acceptance bullets:
- Python test loads and schema-validates all 23 source block metadata.yaml files.
- Python test confirms PULSE block has params TD, TR, TF, PW, PER.
- Python test confirms source.voltage.noise and source.voltage.random descriptions contain "ngspice".
- Python test confirms source.ideal_delay description contains "Xyce" or "xyce".
- Frontend catalog name presence checked in catalog.test.ts.
"""

from __future__ import annotations

import pathlib

import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parents[3]
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks" / "source"

# All 23 FE-47 source block subdirectories → expected block names
SOURCE_BLOCKS: dict[str, str] = {
    "voltage_dc": "source.voltage.dc",
    "voltage_pulse": "source.voltage.pulse",
    "voltage_sin": "source.voltage.sin",
    "voltage_exp": "source.voltage.exp",
    "voltage_pwl": "source.voltage.pwl",
    "voltage_sffm": "source.voltage.sffm",
    "voltage_am": "source.voltage.am",
    "voltage_noise": "source.voltage.noise",
    "voltage_random": "source.voltage.random",
    "voltage_rf_port": "source.voltage.rf_port",
    "current_dc": "source.current.dc",
    "current_pulse": "source.current.pulse",
    "current_sin": "source.current.sin",
    "current_exp": "source.current.exp",
    "current_pwl": "source.current.pwl",
    "current_sffm": "source.current.sffm",
    "current_am": "source.current.am",
    "dependent_vcvs": "source.dependent.vcvs",
    "dependent_vccs": "source.dependent.vccs",
    "dependent_cccs": "source.dependent.cccs",
    "dependent_ccvs": "source.dependent.ccvs",
    "behavioral": "source.behavioral",
    "ideal_delay": "source.ideal_delay",
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


# ---------------------------------------------------------------------------
# Existence
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir,expected_name", list(SOURCE_BLOCKS.items()))
def test_source_block_exists(subdir: str, expected_name: str) -> None:
    """metadata.yaml exists for every source block."""
    path = BLOCKS_ROOT / subdir / "metadata.yaml"
    assert path.exists(), f"Missing metadata.yaml for {expected_name} at {path}"


# ---------------------------------------------------------------------------
# Name and structural validation (mirrors block-metadata.schema.json required fields)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir,expected_name", list(SOURCE_BLOCKS.items()))
def test_source_block_name(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    assert data["name"] == expected_name, f"{subdir}: name mismatch"


@pytest.mark.parametrize("subdir,expected_name", list(SOURCE_BLOCKS.items()))
def test_source_block_required_top_level_keys(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    for key in REQUIRED_TOP_LEVEL:
        assert key in data, f"{expected_name}: missing required top-level key '{key}'"


@pytest.mark.parametrize("subdir,expected_name", list(SOURCE_BLOCKS.items()))
def test_source_block_required_behavior_keys(subdir: str, expected_name: str) -> None:
    data = _load_metadata(subdir)
    behavior = data.get("behavior", {})
    for key in REQUIRED_BEHAVIOR:
        assert key in behavior, f"{expected_name}: missing required behavior key '{key}'"


# ---------------------------------------------------------------------------
# Category checks
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "subdir,expected_name",
    [(k, v) for k, v in SOURCE_BLOCKS.items() if not v.startswith("source.dependent.")],
)
def test_non_dependent_source_category(subdir: str, expected_name: str) -> None:
    """Independent and behavioral sources have category 'sources'."""
    data = _load_metadata(subdir)
    assert data["category"] == "sources", (
        f"{expected_name}: expected category 'sources', got '{data['category']}'"
    )


@pytest.mark.parametrize(
    "subdir,expected_name",
    [(k, v) for k, v in SOURCE_BLOCKS.items() if v.startswith("source.dependent.")],
)
def test_dependent_source_category(subdir: str, expected_name: str) -> None:
    """Dependent sources have category 'dependent'."""
    data = _load_metadata(subdir)
    assert data["category"] == "dependent", (
        f"{expected_name}: expected category 'dependent', got '{data['category']}'"
    )


# ---------------------------------------------------------------------------
# FE-47 acceptance bullet: PULSE block has params TD, TR, TF, PW, PER
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("subdir", ["voltage_pulse", "current_pulse"])
def test_pulse_has_required_params(subdir: str) -> None:
    data = _load_metadata(subdir)
    param_names = {p["name"] for p in data["params"]}
    for required in ("TD", "TR", "TF", "PW", "PER"):
        assert required in param_names, f"{subdir} missing param '{required}'"


# ---------------------------------------------------------------------------
# FE-47 acceptance bullet: ngspice-only descriptions
# ---------------------------------------------------------------------------


def test_voltage_noise_description_mentions_ngspice() -> None:
    data = _load_metadata("voltage_noise")
    desc = data.get("description", "")
    assert "ngspice" in desc.lower(), (
        f"source.voltage.noise description should mention 'ngspice', got: {desc!r}"
    )


def test_voltage_random_description_mentions_ngspice() -> None:
    data = _load_metadata("voltage_random")
    desc = data.get("description", "")
    assert "ngspice" in desc.lower(), (
        f"source.voltage.random description should mention 'ngspice', got: {desc!r}"
    )


# ---------------------------------------------------------------------------
# FE-47 acceptance bullet: xyce-only ideal_delay description
# ---------------------------------------------------------------------------


def test_ideal_delay_description_mentions_xyce() -> None:
    data = _load_metadata("ideal_delay")
    desc = data.get("description", "")
    assert "xyce" in desc.lower(), (
        f"source.ideal_delay description should mention 'Xyce' or 'xyce', got: {desc!r}"
    )
