"""SolverBackend protocol definition (BE-21)."""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np


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
