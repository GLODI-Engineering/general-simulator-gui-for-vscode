"""Simulation directive extraction: IR1Graph → SimulationPlan (BE-35).

``extract_simulation`` reads ``model.simulation`` from an IR1Graph and returns
a typed :class:`~simulator.solvers.protocol.SimulationPlan` whose
:class:`~simulator.solvers.protocol.AnalysisRequest` list is already expanded
for sweeps (linear, by-values).  Unsupported analysis types (NOISE, TF) raise
:class:`~simulator.solvers.protocol.UnsupportedAnalysisError` immediately.
"""

from __future__ import annotations

import itertools
import math
from typing import Any

import numpy as np

from simulator.ir.ir1 import IR1Graph
from simulator.solvers.protocol import (
    AnalysisRequest,
    SimulationPlan,
    UnsupportedAnalysisError,
)

_UNSUPPORTED_TYPES: frozenset[str] = frozenset({"NOISE", "TF"})
_SUPPORTED_TYPES: frozenset[str] = frozenset({"OP", "TRAN", "AC", "DC"})

# Keys that are not part of analysis *params* — they are structural.
_NON_PARAM_KEYS: frozenset[str] = frozenset({"id", "type", "sweeps", "solver_options"})


def extract_simulation(model: IR1Graph) -> SimulationPlan:
    """Extract and expand simulation directives from *model*.

    Parameters
    ----------
    model:
        An :class:`~simulator.ir.ir1.IR1Graph` whose ``.simulation`` field
        carries the raw analysis list from the .gsim_sch document.

    Returns
    -------
    SimulationPlan
        All analyses expanded for sweeps (Cartesian product when multiple
        sweeps are present on one analysis).

    Raises
    ------
    UnsupportedAnalysisError
        If any analysis has ``type`` in ``{"NOISE", "TF"}``.
    """
    sim = model.simulation
    model_solver: dict[str, Any] = dict(sim.solver)

    all_requests: list[AnalysisRequest] = []

    for raw in sim.analyses:
        a_type: str = str(raw.get("type", ""))

        if a_type in _UNSUPPORTED_TYPES:
            raise UnsupportedAnalysisError(f"{a_type} analysis is not implemented in v2")

        # Extract analysis-specific params (everything except structural keys).
        base_params: dict[str, Any] = {k: v for k, v in raw.items() if k not in _NON_PARAM_KEYS}

        # Merge model-level solver with any per-analysis override.
        per_analysis_solver: dict[str, Any] = dict(raw.get("solver_options", {}))
        effective_solver: dict[str, Any] = {**model_solver, **per_analysis_solver}

        raw_sweeps: list[dict[str, Any]] = list(raw.get("sweeps", []))

        if not raw_sweeps:
            # No sweep — single AnalysisRequest.
            all_requests.append(
                AnalysisRequest(
                    id=str(raw["id"]),
                    type=a_type,
                    params=dict(base_params),
                    sweeps=[],
                    solver_options=effective_solver,
                )
            )
        else:
            # Expand each sweep into a list of (param_name, value) pairs.
            sweep_columns: list[list[tuple[str, float]]] = []
            for sw in raw_sweeps:
                param_name: str = str(sw["param"])
                vals: list[float] = _expand_sweep_values(sw)
                sweep_columns.append([(param_name, v) for v in vals])

            # Cartesian product over all sweep axes.
            base_id = str(raw["id"])
            for i, combo in enumerate(itertools.product(*sweep_columns)):
                extra: dict[str, Any] = {k: v for k, v in combo}
                all_requests.append(
                    AnalysisRequest(
                        id=f"{base_id}_{i}",
                        type=a_type,
                        params={**base_params, **extra},
                        sweeps=[],
                        solver_options=effective_solver,
                    )
                )

    # Determine default_id.
    default_id: str = _resolve_default_id(sim.default_analysis, all_requests)

    return SimulationPlan(analyses=all_requests, default_id=default_id)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _expand_sweep_values(sw: dict[str, Any]) -> list[float]:
    """Return the list of float values described by a single sweep spec."""
    if "values" in sw:
        return [float(v) for v in sw["values"]]

    if "lin" in sw:
        lin = sw["lin"]
        start = float(lin["start"])
        stop = float(lin["stop"])
        n = int(lin["n"])
        if n <= 1:
            return [start]
        return list(np.linspace(start, stop, n))

    if "dec" in sw:
        dec = sw["dec"]
        start = float(dec["start"])
        stop = float(dec["stop"])
        n_per_decade = float(dec["n_per_decade"])
        if start <= 0 or stop <= 0:
            return []
        n_decades = math.log10(stop / start)
        n_total = max(2, round(n_per_decade * n_decades) + 1)
        return list(np.logspace(math.log10(start), math.log10(stop), n_total))

    return []


def _resolve_default_id(default_analysis: str, requests: list[AnalysisRequest]) -> str:
    """Return the effective default_id from the plan."""
    if not requests:
        return ""

    if default_analysis:
        # Exact match first (non-expanded analyses).
        for req in requests:
            if req.id == default_analysis:
                return req.id
        # Expanded analyses get ids like "{base}_{i}" — match first expansion.
        prefix = default_analysis + "_"
        for req in requests:
            if req.id.startswith(prefix):
                return req.id

    # Fall back to the very first analysis in the plan.
    return requests[0].id


def analysis_request_to_options_dict(req: AnalysisRequest) -> dict[str, Any]:
    """Map an :class:`AnalysisRequest` to a flat dict compatible with
    :class:`~simulator.solvers.protocol.SolverOptions` keyword arguments.

    Used by the simulate IPC handler to translate a model-level
    ``AnalysisRequest`` into ``SolverOptions``.  The caller may overlay
    additional payload options on top of the returned dict.
    """
    result: dict[str, Any] = {"analysis_type": req.type}
    p = req.params

    if req.type == "TRAN":
        if "t_start" in p:
            result["t_start"] = float(p["t_start"])
        if "t_end" in p:
            result["t_end"] = float(p["t_end"])
        if "t_end" in p and "t_step" in p:
            t_end = float(p["t_end"])
            t_step = float(p["t_step"])
            if t_step > 0:
                result["n_samples"] = max(1, round(t_end / t_step))
        if "uic" in p:
            result["uic"] = bool(p["uic"])

    elif req.type == "AC":
        if "f_start" in p:
            result["ac_fstart"] = float(p["f_start"])
        if "f_end" in p:
            result["ac_fstop"] = float(p["f_end"])
        if "n_points" in p:
            result["ac_points"] = int(p["n_points"])

    elif req.type == "DC":
        if "source" in p:
            result["dc_source"] = str(p["source"])
        if "start" in p:
            result["dc_start"] = float(p["start"])
        if "stop" in p:
            result["dc_stop"] = float(p["stop"])
        if "step" in p:
            result["dc_step"] = float(p["step"])

    # Solver options mapping (schema names → SolverOptions field names).
    so = req.solver_options
    if "abstol" in so:
        result["atol"] = float(so["abstol"])
    if "reltol" in so:
        result["rtol"] = float(so["reltol"])
    if "method" in so:
        result["method"] = str(so["method"])

    return result
