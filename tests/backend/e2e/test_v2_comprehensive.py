"""BE-41 tester coverage — comprehensive v2 assertions.

These tests verify the BE-41 tester-agent acceptance bullets independently.
"""

from __future__ import annotations

import copy
import importlib.util
import pathlib
from typing import Any

import pytest
import yaml

from simulator.compiler.goto_from_resolve import resolve_goto_from
from simulator.compiler.gsim_sch_flatten import flatten
from simulator.compiler.gsim_sch_loader import ModelDocument, load
from simulator.compiler.ir1_builder import build as build_ir1
from simulator.compiler.ir2_lowering import lower as lower_ir2
from simulator.compiler.param_substitution import substitute_params
from simulator.compiler.scipy_compiler import compile as compile_model
from simulator.solvers.protocol import ResultBundle, SolverOptions
from simulator.solvers.scipy_solver import ScipySolver

REPO_ROOT = pathlib.Path(__file__).parents[3]
FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "gsim_sch" / "comprehensive.gsim_sch"
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks"

EXPECTED_OP_VALUE = 50.0
EXPECTED_TRAN_FINAL = 2.0


def _run_pipeline(doc: ModelDocument, *, t_end: float, n_samples: int) -> ResultBundle:
    """Run flatten → goto/from resolve → param substitute → lower → solve."""
    flat = flatten(doc)
    rewired = resolve_goto_from(flat)

    substituted_model: dict[str, Any] = substitute_params(rewired.model)
    substituted_doc = ModelDocument(
        schema_version=rewired.schema_version,
        model=substituted_model,
        resolved_params=rewired.resolved_params,
    )

    ir1 = build_ir1(substituted_doc)
    ir2 = lower_ir2(ir1)
    compiled = compile_model(ir2)

    solver = ScipySolver()
    opts = SolverOptions(t_start=0.0, t_end=t_end, n_samples=n_samples)
    return solver.solve(compiled, t_span=(0.0, t_end), options=opts)


def _fixture_doc() -> ModelDocument:
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found: {FIXTURE_PATH}")
    return load(FIXTURE_PATH)


def _load_equations(block_type: str) -> Any:  # type: ignore[no-untyped-def]
    eq_path = BLOCKS_ROOT / pathlib.Path(*block_type.split(".")) / "equations.py"
    assert eq_path.exists(), f"Missing equations.py for {block_type} at {eq_path}"

    spec = importlib.util.spec_from_file_location(block_type.replace(".", "_"), eq_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module.Equations()


def _load_metadata(block_type: str) -> dict[str, Any]:
    metadata_path = BLOCKS_ROOT / pathlib.Path(*block_type.split(".")) / "metadata.yaml"
    assert metadata_path.exists(), f"Missing metadata.yaml for {block_type} at {metadata_path}"
    return yaml.safe_load(metadata_path.read_text(encoding="utf-8"))


def test_v2_comprehensive_op() -> None:
    """OP acceptance: steady-state node value is the expected 50.0."""
    result = _run_pipeline(_fixture_doc(), t_end=0.1, n_samples=10)

    scope_op = next((s for s in result.signals if s.block_id == "scope_op"), None)
    assert scope_op is not None, "Missing scope_op signal"
    assert float(scope_op.data[0]) == pytest.approx(EXPECTED_OP_VALUE, abs=1e-6)


def test_v2_comprehensive_tran() -> None:
    """TRAN acceptance: non-empty time series with expected final value."""
    result = _run_pipeline(_fixture_doc(), t_end=2.0, n_samples=200)

    scope_tran = next((s for s in result.signals if s.block_id == "scope_tran"), None)
    assert scope_tran is not None, "Missing scope_tran signal"
    assert len(scope_tran.data) > 0, "scope_tran must be non-empty"
    assert float(scope_tran.data[-1]) == pytest.approx(EXPECTED_TRAN_FINAL, rel=0.01)


def test_v2_comprehensive_subsystem_propagation() -> None:
    """Parent param aliases propagate through depth-2 subsystem nesting."""
    base = _fixture_doc()
    model = copy.deepcopy(base.model)

    sub1 = next(b for b in model["blocks"] if b["id"] == "sub1")
    sub1["subsystem"]["parent_param_aliases"] = [{"child": "P_OUTER", "parent": "A"}]

    sub2 = next(b for b in sub1["subsystem"]["blocks"] if b["id"] == "sub2")
    sub2["subsystem"]["parent_param_aliases"] = [{"child": "P_INNER", "parent": "P_OUTER"}]

    gain_inner = next(b for b in sub2["subsystem"]["blocks"] if b["id"] == "gain_inner")
    gain_inner["params"]["k"] = "P_INNER"

    flat = flatten(
        ModelDocument(
            schema_version=base.schema_version,
            model=model,
            resolved_params=base.resolved_params,
        )
    )

    flattened_inner = next(b for b in flat.model["blocks"] if b["id"] == "sub1/sub2/gain_inner")
    assert flattened_inner["params"]["k"] == pytest.approx(5.0)


def test_v2_comprehensive_goto_from() -> None:
    """Global Goto in one subsystem drives From in another; integrator final value reflects it."""
    doc = ModelDocument(
        schema_version=2,
        resolved_params={},
        model={
            "id": "goto-from-cross-subsystem",
            "name": "Goto/From cross subsystem",
            "params": [],
            "blocks": [
                {
                    "id": "producer",
                    "type": "hierarchy.subsystem.virtual",
                    "params": {},
                    "subsystem": {
                        "blocks": [
                            {
                                "id": "const",
                                "type": "signal.constant",
                                "params": {"value": 2.0},
                                "ic": {},
                            },
                            {
                                "id": "goto",
                                "type": "routing.goto",
                                "params": {"tag": "cross", "visibility": "global"},
                                "ic": {},
                            },
                        ],
                        "wires": [
                            {
                                "id": "w_const_goto",
                                "from": {"block": "const", "port": "out"},
                                "to": {"block": "goto", "port": "in"},
                                "kind": "signal",
                            }
                        ],
                        "parent_param_aliases": [],
                        "ports": [],
                    },
                },
                {
                    "id": "consumer",
                    "type": "hierarchy.subsystem.virtual",
                    "params": {},
                    "subsystem": {
                        "blocks": [
                            {
                                "id": "from",
                                "type": "routing.from",
                                "params": {"tag": "cross"},
                                "ic": {},
                            },
                            {
                                "id": "integ",
                                "type": "control.integrator",
                                "params": {"hi": 1_000_000.0, "lo": -1_000_000.0, "x0": 0.0},
                                "ic": {"x": 0.0},
                            },
                            {
                                "id": "scope",
                                "type": "sinks.scope",
                                "params": {},
                                "ic": {},
                            },
                        ],
                        "wires": [
                            {
                                "id": "w_from_integ",
                                "from": {"block": "from", "port": "out"},
                                "to": {"block": "integ", "port": "in"},
                                "kind": "signal",
                            },
                            {
                                "id": "w_integ_scope",
                                "from": {"block": "integ", "port": "out"},
                                "to": {"block": "scope", "port": "in"},
                                "kind": "signal",
                            },
                        ],
                        "parent_param_aliases": [],
                        "ports": [],
                    },
                },
            ],
            "wires": [],
            "simulation": {
                "default_analysis": "tran1",
                "analyses": [{"id": "tran1", "type": "TRAN", "t_end": 1.0, "t_step": 0.01}],
            },
        },
    )

    result = _run_pipeline(doc, t_end=1.0, n_samples=101)
    scope = next((s for s in result.signals if s.block_id == "consumer/scope"), None)

    assert scope is not None, "Missing consumer/scope signal"
    assert len(scope.data) > 0
    # dx/dt = 2.0, x0 = 0.0, t_end = 1.0 => x(1.0) = 2.0
    assert float(scope.data[-1]) == pytest.approx(2.0, rel=0.01)


def test_v2_comprehensive_converter_coupling() -> None:
    """signal_to_physical_signal output correctly maps to controlled_voltage command."""
    conv = _load_equations("converter.signal_to_physical_signal")

    conv_out, _ = conv.derivatives(
        t=0.0,
        inputs={"in": 4.0},
        state={},
        params={"gain": 1.5},
    )
    physical_signal = conv_out["out"]

    cv_meta = _load_metadata("physical-electrical.source.voltage.controlled_voltage")
    cv_gain = next(p["default"] for p in cv_meta["params"] if p["name"] == "gain")

    commanded_voltage = float(cv_gain) * float(physical_signal)
    assert physical_signal == pytest.approx(6.0)
    assert commanded_voltage == pytest.approx(6.0)
