"""Cross-scope .PARAM substitution for .gsim_sch v2 models (BE-34)."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from simulator.compiler.param_expression import evaluate_param_value


class ParamCycleError(ValueError):
    """Raised when param resolution detects a dependency cycle."""

    def __init__(self, chain: list[str]) -> None:
        self.chain = chain
        super().__init__(f"Param cycle: {' -> '.join(chain)}")


class UnresolvedParamError(ValueError):
    """Raised when a referenced identifier cannot be resolved."""

    def __init__(self, name: str, block_id: str | None = None) -> None:
        self.name = name
        self.block_id = block_id
        if block_id is None:
            super().__init__(f"Unresolved param: {name!r}")
        else:
            super().__init__(f"Unresolved param {name!r} in block {block_id!r}")


@dataclass
class _Scope:
    params_raw: dict[str, Any]
    aliases: dict[str, str]
    parent: _Scope | None
    root: _Scope | None = None


def substitute_params(model: dict[str, Any]) -> dict[str, Any]:
    """Return *model* with params/ICs/simulation numeric fields substituted.

    The input dict is not mutated.
    """
    out = copy.deepcopy(model)

    root_scope = _Scope(
        params_raw=_param_table_to_dict(out.get("params", [])),
        aliases={},
        parent=None,
    )
    root_scope.root = root_scope

    _substitute_model_scope(out, root_scope)
    return out


def _param_table_to_dict(params: list[dict[str, Any]]) -> dict[str, Any]:
    return {entry["name"]: entry.get("value") for entry in params}


def _substitute_model_scope(model: dict[str, Any], scope: _Scope) -> None:
    cache: dict[tuple[int, str], float] = {}
    visiting: list[tuple[int, str]] = []

    def resolve_name(name: str, *, block_id: str | None) -> float:
        return _resolve_name(
            scope=scope,
            name=name,
            block_id=block_id,
            cache=cache,
            visiting=visiting,
        )

    # 1) Resolve this model's own param table to floats.
    for param in model.get("params", []):
        pname = param["name"]
        param["value"] = resolve_name(pname, block_id=None)

    # 2) Block params + block IC, and recurse into child subsystems.
    for block in model.get("blocks", []):
        bid = block.get("id")

        params = block.get("params")
        if isinstance(params, dict):
            for key, value in list(params.items()):
                params[key] = _eval_value(
                    scope, value, block_id=bid, cache=cache, visiting=visiting
                )

        ic = block.get("ic")
        if isinstance(ic, dict):
            for key, value in list(ic.items()):
                ic[key] = _eval_value(scope, value, block_id=bid, cache=cache, visiting=visiting)

        sub = block.get("subsystem")
        if isinstance(sub, dict):
            child_scope = _Scope(
                params_raw=_param_table_to_dict(sub.get("params", [])),
                aliases={a["child"]: a["parent"] for a in sub.get("parent_param_aliases", [])},
                parent=scope,
                root=scope.root,
            )
            _substitute_model_scope(sub, child_scope)

    # 3) Simulation directive numeric fields.
    simulation = model.get("simulation")
    if isinstance(simulation, dict):
        _substitute_simulation(simulation, scope, cache=cache, visiting=visiting)


def _substitute_simulation(
    simulation: dict[str, Any],
    scope: _Scope,
    *,
    cache: dict[tuple[int, str], float],
    visiting: list[tuple[int, str]],
) -> None:
    for analysis in simulation.get("analyses", []):
        if not isinstance(analysis, dict):
            continue
        atype = analysis.get("type")

        if atype == "TRAN":
            for key in ("t_start", "t_end", "t_step"):
                if key in analysis:
                    analysis[key] = _eval_value(
                        scope,
                        analysis[key],
                        block_id="<simulation>",
                        cache=cache,
                        visiting=visiting,
                    )
        elif atype == "AC":
            for key in ("n_points", "f_start", "f_end"):
                if key in analysis:
                    analysis[key] = _eval_value(
                        scope,
                        analysis[key],
                        block_id="<simulation>",
                        cache=cache,
                        visiting=visiting,
                    )
        elif atype == "DC":
            for key in ("start", "stop", "step"):
                if key in analysis:
                    analysis[key] = _eval_value(
                        scope,
                        analysis[key],
                        block_id="<simulation>",
                        cache=cache,
                        visiting=visiting,
                    )

        sweeps = analysis.get("sweeps")
        if isinstance(sweeps, list):
            for sweep in sweeps:
                if not isinstance(sweep, dict):
                    continue
                if "lin" in sweep and isinstance(sweep["lin"], dict):
                    lin = sweep["lin"]
                    for key in ("start", "stop", "n"):
                        if key in lin:
                            lin[key] = _eval_value(
                                scope,
                                lin[key],
                                block_id="<simulation>",
                                cache=cache,
                                visiting=visiting,
                            )
                if "dec" in sweep and isinstance(sweep["dec"], dict):
                    dec = sweep["dec"]
                    for key in ("start", "stop", "n_per_decade"):
                        if key in dec:
                            dec[key] = _eval_value(
                                scope,
                                dec[key],
                                block_id="<simulation>",
                                cache=cache,
                                visiting=visiting,
                            )

    initial_conditions = simulation.get("initial_conditions")
    if isinstance(initial_conditions, list):
        for ic in initial_conditions:
            if isinstance(ic, dict) and "value" in ic:
                ic["value"] = _eval_value(
                    scope,
                    ic["value"],
                    block_id="<simulation>",
                    cache=cache,
                    visiting=visiting,
                )


def _eval_value(
    scope: _Scope,
    value: Any,
    *,
    block_id: str | None,
    cache: dict[tuple[int, str], float],
    visiting: list[tuple[int, str]],
) -> float:
    return evaluate_param_value(
        value,
        lambda name: _resolve_name(
            scope=scope,
            name=name,
            block_id=block_id,
            cache=cache,
            visiting=visiting,
        ),
    )


def _resolve_name(
    *,
    scope: _Scope,
    name: str,
    block_id: str | None,
    cache: dict[tuple[int, str], float],
    visiting: list[tuple[int, str]],
) -> float:
    root = scope.root or scope
    key = (id(scope), name)

    if key in cache:
        return cache[key]

    if key in visiting:
        idx = visiting.index(key)
        chain = [n for _, n in visiting[idx:]] + [name]
        raise ParamCycleError(chain)

    visiting.append(key)
    try:
        if name in scope.params_raw:
            value = _eval_value(
                scope,
                scope.params_raw[name],
                block_id=block_id,
                cache=cache,
                visiting=visiting,
            )
            cache[key] = value
            return value

        alias_target = scope.aliases.get(name)
        if alias_target is not None and scope.parent is not None:
            value = _resolve_name(
                scope=scope.parent,
                name=alias_target,
                block_id=block_id,
                cache=cache,
                visiting=visiting,
            )
            cache[key] = value
            return value

        # Global fallback: unresolved names in nested scopes may resolve from
        # the root model param table.
        if scope is not root:
            value = _resolve_name(
                scope=root,
                name=name,
                block_id=block_id,
                cache=cache,
                visiting=visiting,
            )
            cache[key] = value
            return value

        raise UnresolvedParamError(name=name, block_id=block_id)
    finally:
        visiting.pop()
