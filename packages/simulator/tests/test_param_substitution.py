"""BE-34 — Param substitution and resolution tests."""

from __future__ import annotations

import pytest

from simulator.compiler.param_substitution import (
    ParamCycleError,
    UnresolvedParamError,
    substitute_params,
)


def test_block_param_reference():
    """A block with R='Rload' and model param Rload=1000 substitutes to R=1000.0."""
    model = {
        "params": [{"name": "Rload", "value": 1000}],
        "blocks": [{"id": "b1", "type": "elec.resistor", "params": {"R": "Rload"}}],
    }
    result = substitute_params(model)
    assert result["blocks"][0]["params"]["R"] == 1000.0


def test_block_param_expression():
    """A block with R='{Rload*2}' substitutes to R=2000.0."""
    model = {
        "params": [{"name": "Rload", "value": 1000}],
        "blocks": [{"id": "b1", "type": "elec.resistor", "params": {"R": "{Rload*2}"}}],
    }
    result = substitute_params(model)
    assert result["blocks"][0]["params"]["R"] == 2000.0


def test_alias_resolution():
    """Inside an aliased subsystem (child:Kp parent:Kp_outer),
    a block referencing Kp resolves to Kp_outer's value.
    """
    model = {
        "params": [{"name": "Kp_outer", "value": 5.0}],
        "blocks": [
            {
                "id": "sub1",
                "type": "subsystem",
                "subsystem": {
                    "parent_param_aliases": [{"child": "Kp", "parent": "Kp_outer"}],
                    "blocks": [{"id": "b_inner", "type": "control.gain", "params": {"gain": "Kp"}}],
                },
            }
        ],
    }
    result = substitute_params(model)
    sub = result["blocks"][0]["subsystem"]
    assert sub["blocks"][0]["params"]["gain"] == 5.0


def test_cycle_cross_scope():
    """A cycle across parent/child via alias raises ParamCycleError."""
    model = {
        "params": [{"name": "A", "value": "{B}"}, {"name": "B", "value": "{A}"}],
        "blocks": [
            {
                "id": "sub1",
                "type": "subsystem",
                "subsystem": {
                    "parent_param_aliases": [{"child": "C", "parent": "A"}],
                    "blocks": [{"id": "b1", "type": "gain", "params": {"k": "C"}}],
                },
            }
        ],
    }
    with pytest.raises(ParamCycleError) as excinfo:
        substitute_params(model)
    assert "A -> B -> A" in str(excinfo.value)


def test_unresolved_identifier():
    """R='Nope' raises UnresolvedParamError naming 'Nope' and the block id."""
    model = {"blocks": [{"id": "res1", "type": "elec.resistor", "params": {"R": "Nope"}}]}
    with pytest.raises(UnresolvedParamError) as excinfo:
        substitute_params(model)
    assert "'Nope'" in str(excinfo.value)
    assert "'res1'" in str(excinfo.value)


def test_simulation_t_end_expr():
    """t_end='Tend' substitutes to the model param Tend's value."""
    model = {
        "params": [{"name": "Tend", "value": 0.05}],
        "simulation": {
            "analyses": [{"type": "TRAN", "t_start": 0, "t_end": "Tend", "t_step": 0.001}]
        },
    }
    result = substitute_params(model)
    assert result["simulation"]["analyses"][0]["t_end"] == 0.05
