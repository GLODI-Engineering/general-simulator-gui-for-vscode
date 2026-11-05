"""BE-44 (Mode A) — signal-flow attribute block acceptance tests."""

from __future__ import annotations

import importlib.util
import pathlib
from typing import Any

import pytest

from simulator.compiler.ir1_builder import UnknownUnitError, UnsupportedBlockError, build_ir1
from simulator.compiler.unit_table import resolve_scale

REPO_ROOT = pathlib.Path(__file__).parents[2]
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks"


def _load_equations(block_type: str) -> Any:  # type: ignore[no-untyped-def]
    eq_path = BLOCKS_ROOT / pathlib.Path(*block_type.split(".")) / "equations.py"
    assert eq_path.exists(), f"Missing equations.py for {block_type} at {eq_path}"

    spec = importlib.util.spec_from_file_location(block_type.replace(".", "_"), eq_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module.Equations()


def test_signal_spec_passthrough() -> None:
    """signal_specification dim=[3] passes [1,2,3] through unchanged."""
    eq = _load_equations("signal-flow.attributes.signal_specification")

    out, _ = eq.derivatives(
        t=0.0,
        inputs={"in": [1, 2, 3]},
        state={},
        params={"dim": [3]},
    )

    assert out["out"] == [1, 2, 3]


def test_ic_on_wire_initial() -> None:
    """ic-on-wire emits value at t=0, then passes input through."""
    eq = _load_equations("signal-flow.attributes.ic")

    out_t0, _ = eq.derivatives(
        t=0.0,
        inputs={"in": 9.0},
        state={},
        params={"value": 5.0, "t_start": 0.0},
    )
    out_t1, _ = eq.derivatives(
        t=1.0,
        inputs={"in": 9.0},
        state={},
        params={"value": 5.0, "t_start": 0.0},
    )

    assert out_t0["out"] == pytest.approx(5.0)
    assert out_t1["out"] == pytest.approx(9.0)


def test_unit_conversion_ms_to_s() -> None:
    """from_unit='ms' to_unit='s' scales 1000 -> 1.0."""
    doc = {
        "model": {
            "blocks": [
                {
                    "id": "uc",
                    "type": "signal-flow.attributes.unit_conversion",
                    "params": {"from_unit": "ms", "to_unit": "s"},
                }
            ],
            "wires": [],
        }
    }

    graph = build_ir1(doc)
    uc_block = next(b for b in graph.blocks if b.instance_id == "uc")

    eq = _load_equations("signal-flow.attributes.unit_conversion")
    out, _ = eq.derivatives(
        t=0.0,
        inputs={"in": 1000.0},
        state={},
        params=uc_block.params,
    )

    assert uc_block.params["scale"] == pytest.approx(1e-3)
    assert out["out"] == pytest.approx(1.0)


def test_unit_conversion_unknown() -> None:
    """from_unit='wibble' raises UnknownUnitError."""
    doc = {
        "model": {
            "blocks": [
                {
                    "id": "uc",
                    "type": "signal-flow.attributes.unit_conversion",
                    "params": {"from_unit": "wibble", "to_unit": "s"},
                }
            ],
            "wires": [],
        }
    }

    with pytest.raises(UnknownUnitError) as exc_info:
        build_ir1(doc)

    assert exc_info.value.unit == "wibble"


def test_unit_table_si_prefix() -> None:
    """SI prefix table resolves k and µ prefixes for representative units."""
    assert resolve_scale("kV", "V") == pytest.approx(1000.0)
    assert resolve_scale("µF", "F") == pytest.approx(1e-6)


def test_probe_outputs() -> None:
    """Probe outputs width/dim/complexity for a dim=[2,3] real signal."""
    eq = _load_equations("signal-flow.attributes.probe")

    out, _ = eq.derivatives(
        t=0.0,
        inputs={"in": 0.0},
        state={},
        params={"dim": [2, 3], "complexity": "real"},
    )

    assert out["width_out"] == pytest.approx(6.0)
    assert out["dim_out"] == "[2, 3]"
    assert out["complexity_out"] == pytest.approx(0.0)


def test_unsupported_data_type_conversion() -> None:
    """data_type_conversion block is v3-only and must raise UnsupportedBlockError."""
    doc = {
        "model": {
            "blocks": [
                {
                    "id": "dtc",
                    "type": "signal-flow.attributes.data_type_conversion",
                    "params": {},
                }
            ],
            "wires": [],
        }
    }

    with pytest.raises(UnsupportedBlockError):
        build_ir1(doc)
