"""SolverBackend protocol definition (BE-21)."""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol

import numpy as np

from simulator.postprocess.event_log import EventLog


class UnsupportedAnalysisError(ValueError):
    """Raised when an analysis type is not supported in v2."""


@dataclass
class AnalysisRequest:
    """A single resolved analysis to be dispatched to a solver."""

    id: str
    type: str  # OP, TRAN, AC, DC
    params: dict[str, Any]  # analysis-specific params (t_end, t_step, f_start, …)
    sweeps: list[dict[str, Any]]  # raw sweep specs; empty after expansion
    solver_options: dict[
        str, Any
    ]  # effective solver options (model-level merged with per-analysis)


@dataclass
class SimulationPlan:
    """Extracted and expanded simulation plan produced by extract_simulation."""

    analyses: list[AnalysisRequest]
    default_id: str


class CancelToken:
    """Thread-safe cancellation flag."""

    def __init__(self) -> None:
        self._cancelled = threading.Event()

    def cancel(self) -> None:
        self._cancelled.set()

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled.is_set()


ProgressCallback = Callable[[float], None]  # frac in [0, 1]


@dataclass
class PartialPoints:
    """A newly-available slice of sweep points read mid-solve (BE-54).

    Emitted by a solver's raw-output tailer while the SPICE subprocess is
    still running, so the frontend can render data as it is produced instead
    of waiting for the full ResultBundle. ``x`` is the new slice of the sweep
    axis (time/frequency/parameter, matching ResultBundle.t's meaning);
    ``signal_values`` maps each signal's ``name`` (matching the eventual
    ResultBundle Signal.name) to its corresponding new value slice.
    """

    x: np.ndarray
    signal_values: dict[str, np.ndarray]


PartialCallback = Callable[[PartialPoints], None]


class SimulationError(RuntimeError):
    """User-facing simulation failure."""


class RunOutcome(StrEnum):
    """How a run ended, from the engine's exit code.

    The engine's codes are not a boolean, and the two cases a user most needs to look at are
    the ones a boolean gets wrong: a rule fired (`2`), or a rule ended the run cleanly (`3`).
    Both produced a waveform. The engine deliberately did not reuse `1` for them precisely so
    a consumer could tell them apart -- see `general-simulator`'s
    `book/dev-guide/src/output-contract.md` §L1.

    A `StrEnum` so it crosses the IPC boundary as its own name without a conversion table.
    """

    #: Exit 0 -- finished, with nothing to report or warnings only.
    COMPLETED = "completed"
    #: Exit 2 -- finished, and a rule of severity `error` or `fatal` fired. The waveform is
    #: complete; the findings are in `ResultBundle.event_log`.
    RULE_VIOLATED = "rule-violated"
    #: Exit 3 -- a rule ended the run early and cleanly: the step finished and every file was
    #: flushed, so the waveform is valid up to the stop.
    STOPPED_BY_RULE = "stopped-by-rule"


@dataclass
class SolverOptions:
    analysis_type: str = "TRAN"
    t_start: float = 0.0
    t_end: float = 10.0
    n_samples: int = 3000
    rtol: float = 1e-6
    atol: float = 1e-9
    method: str = "Radau"
    ac_fstart: float = 1.0
    ac_fstop: float = 1e6
    ac_points: int = 100
    dc_source: str = ""
    dc_start: float = 0.0
    dc_stop: float = 5.0
    dc_step: float = 0.1
    # When True, emit UIC on .TRAN line so SPICE uses element IC= values
    # instead of computing a DC operating point first.
    uic: bool = False


@dataclass
class Signal:
    """A single named signal waveform."""

    block_id: str
    port_id: str
    name: str
    data: np.ndarray  # float32[N]


@dataclass
class ResultBundle:
    sim_id: str
    t: np.ndarray  # float64[N]
    signals: list[Signal]  # ordered list of signals
    # Legacy dict kept for internal use (ipc handlers etc.)
    _signals_dict: dict[tuple[str, str], np.ndarray] = field(default_factory=dict)
    _signal_names: dict[tuple[str, str], str] = field(default_factory=dict)
    t_start: float = 0.0
    t_end: float = 0.0
    n_points: int = 0
    #: What the run *found*: the engine's rule events and per-rule summaries, read back from
    #: the stream it writes beside the waveform. Empty for a deck with no rules, which is the
    #: common case and not an error. See `simulator.postprocess.event_log`.
    event_log: EventLog = field(default_factory=EventLog)
    #: How the run ended, from the engine's own exit code -- see `RunOutcome`. A run that a
    #: rule stopped, or during which a rule fired, produced a waveform and is not a failure;
    #: this is what lets a consumer say which happened instead of showing a clean run.
    outcome: RunOutcome = RunOutcome.COMPLETED
    #: For `RunOutcome.STOPPED_BY_RULE`: the rule that ended the run, when the engine named it.
    stopped_by: str | None = None

    @property
    def time(self) -> np.ndarray:
        """Alias for .t used by tests."""
        return self.t

    @property
    def signal_dict(self) -> dict[tuple[str, str], np.ndarray]:
        return self._signals_dict

    @property
    def signal_names(self) -> dict[tuple[str, str], str]:
        return self._signal_names


class SimIntent:
    TRANSIENT_CONTROL = "transient_control"


class SolverBackend(Protocol):
    """Protocol that all solver backends must implement."""

    name: str
    capabilities: set[str]

    def can_handle(self, ir2: Any, intent: str) -> bool: ...

    def solve(
        self,
        compiled: Any,
        t_span: tuple[float, float],
        options: SolverOptions,
        progress: ProgressCallback | None = None,
        cancel: CancelToken | None = None,
    ) -> ResultBundle: ...
