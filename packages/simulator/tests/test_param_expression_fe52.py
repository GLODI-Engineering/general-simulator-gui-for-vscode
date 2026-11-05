"""FE-52 — param expression evaluator tests."""

from __future__ import annotations

import pytest

from simulator.compiler.param_expression import evaluate_param_value, resolve_params


def test_param_expression_eval_rload_times_two() -> None:
    value = evaluate_param_value(
        "{Rload * 2}",
        resolve_identifier=lambda name: {"Rload": 1000}[name],
    )
    assert value == 2000.0


def test_param_expression_eval_sin_pi_over_two() -> None:
    value = evaluate_param_value("{sin(pi/2)}", resolve_identifier=lambda name: 0.0)
    assert value == pytest.approx(1.0, abs=1e-12)


def test_param_expression_cycle_names_both_nodes() -> None:
    with pytest.raises(ValueError, match=r"Param cycle:.*a.*b.*a") as excinfo:
        resolve_params(
            [
                {"name": "a", "value": "{b}"},
                {"name": "b", "value": "{a}"},
            ]
        )

    msg = str(excinfo.value)
    assert "a" in msg
    assert "b" in msg


def test_param_expression_disallowed_import_is_syntax_error() -> None:
    calls: list[str] = []

    def _resolver(name: str) -> float:
        calls.append(name)
        return 0.0

    with pytest.raises(SyntaxError):
        evaluate_param_value("{__import__('os')}", resolve_identifier=_resolver)

    assert calls == []
