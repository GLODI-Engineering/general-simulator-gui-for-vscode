from __future__ import annotations

import pytest

from simulator.compiler.simulation_extract import extract_simulation
from simulator.ir.ir1 import IR1Graph, IR1SimulationDirective
from simulator.solvers.protocol import UnsupportedAnalysisError


def _graph_with_analyses(analyses: list[dict], default_analysis: str = "") -> IR1Graph:
    return IR1Graph(
        simulation=IR1SimulationDirective(
            analyses=analyses,
            default_analysis=default_analysis,
        )
    )


def test_extract_single_tran() -> None:
    model = _graph_with_analyses(
        analyses=[{"id": "tr1", "type": "TRAN", "t_end": 1e-3, "t_step": 1e-6}],
        default_analysis="tr1",
    )

    plan = extract_simulation(model)

    assert len(plan.analyses) == 1
    req = plan.analyses[0]
    assert req.id == "tr1"
    assert req.type == "TRAN"
    assert req.params["t_end"] == pytest.approx(1e-3)
    assert req.params["t_step"] == pytest.approx(1e-6)
    assert plan.default_id == "tr1"


def test_extract_multiple_analyses() -> None:
    analyses = [
        {"id": "op1", "type": "OP"},
        {"id": "tr1", "type": "TRAN", "t_end": 1.0, "t_step": 0.01},
    ]

    for default_id in ("op1", "tr1"):
        model = _graph_with_analyses(analyses=analyses, default_analysis=default_id)
        plan = extract_simulation(model)

        assert len(plan.analyses) == 2
        assert [req.id for req in plan.analyses] == ["op1", "tr1"]
        assert plan.default_id == default_id


def test_extract_sweep_linear() -> None:
    model = _graph_with_analyses(
        analyses=[
            {
                "id": "tr1",
                "type": "TRAN",
                "t_end": 1.0,
                "t_step": 0.1,
                "sweeps": [
                    {"param": "Rload", "lin": {"start": 0, "stop": 10, "n": 11}},
                ],
            }
        ]
    )

    plan = extract_simulation(model)

    assert len(plan.analyses) == 11
    assert [req.id for req in plan.analyses] == [f"tr1_{i}" for i in range(11)]
    assert [req.params["Rload"] for req in plan.analyses] == pytest.approx(
        [float(i) for i in range(11)]
    )


def test_extract_sweep_cartesian() -> None:
    model = _graph_with_analyses(
        analyses=[
            {
                "id": "tr1",
                "type": "TRAN",
                "t_end": 1.0,
                "t_step": 0.1,
                "sweeps": [
                    {"param": "Rload", "values": [1.0, 2.0, 3.0]},
                    {"param": "Cload", "lin": {"start": 0.0, "stop": 3.0, "n": 4}},
                ],
            }
        ]
    )

    plan = extract_simulation(model)

    assert len(plan.analyses) == 12
    combos = {(req.params["Rload"], req.params["Cload"]) for req in plan.analyses}
    assert len(combos) == 12


def test_extract_unsupported_noise() -> None:
    model = _graph_with_analyses(
        analyses=[
            {"id": "n1", "type": "NOISE", "source": "vin", "output": "v(out)"},
        ]
    )

    with pytest.raises(UnsupportedAnalysisError):
        extract_simulation(model)
