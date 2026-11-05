"""Cancellable subprocess execution for external SPICE solvers (BE-53).

``subprocess.run()`` blocks until the child process exits — a CancelToken
checked only before launch (as NgspiceSolver/XyceSolver did before BE-53)
has no way to reach a solver already running. ``run_cancellable`` replaces
the blocking wait with a short-timeout poll loop so a cancellation lands
within one poll interval instead of waiting for the solver to finish on its
own, and terminates the whole process group (not just the direct child) so
Xyce's ``mpirun``-wrapped multi-rank case is also cleaned up.
"""

from __future__ import annotations

import contextlib
import os
import signal
import subprocess
import time
from collections.abc import Callable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from simulator.solvers.protocol import CancelToken

# How often to check the cancel token / overall deadline while the process
# is running. Small enough that a cancel is noticed promptly; large enough
# that the poll loop doesn't spin.
_DEFAULT_POLL_INTERVAL_S = 0.2

# Grace period between SIGTERM and SIGKILL when terminating a process group.
_TERMINATE_GRACE_S = 2.0

# Fixed subprocess wall-clock timeout for non-TRAN analyses (DC/AC/OP/NOISE/
# TF/PZ), where SolverOptions.t_end has no meaning — see
# default_solver_timeout_seconds() below.
_NON_TRAN_TIMEOUT_S = 120.0


def default_solver_timeout_seconds(analysis_type: str, t_end: float) -> float:
    """Wall-clock timeout (seconds) for an ngspice/Xyce subprocess run.

    Only a TRAN analysis has any relationship between ``t_end`` (the
    simulated-time endpoint, in seconds) and how long the *real* subprocess
    should be allowed to run — the ``* 1000`` factor is a rough "no slower
    than 1000x real time" ceiling. For every other analysis type (DC, AC,
    OP, NOISE, TF, PZ) ``t_end`` is a leftover default/stale value from
    whatever the UI's simulation-settings panel last held (frontend sends
    it unconditionally regardless of the netlist's actual analysis card) —
    using it here was a real bug: a DC sweep imported after an unrelated
    TRAN run with a large t_end silently inherited a multi-hour timeout
    instead of a sane fixed ceiling, and conversely a small/default t_end
    (0.01s, i.e. `max(10, 60)` = 60s) could cut off a DC/AC sweep that
    itself has nothing to do with t_end at all. Use a fixed ceiling for
    anything that isn't TRAN instead.
    """
    if analysis_type.upper() == "TRAN":
        return max(t_end * 1000, 60)
    return _NON_TRAN_TIMEOUT_S


def _terminate_process_group(proc: subprocess.Popen[bytes], grace_s: float) -> None:
    """Send SIGTERM to *proc*'s process group, escalating to SIGKILL.

    No-ops if the process has already exited. Assumes *proc* was launched
    with ``start_new_session=True`` so its pid is also its process group id.
    """
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=grace_s)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    with contextlib.suppress(subprocess.TimeoutExpired):
        proc.wait(timeout=grace_s)


def run_cancellable(
    cmd: list[str],
    *,
    timeout: float,
    cancel: CancelToken | None = None,
    env: dict[str, str] | None = None,
    cwd: str | None = None,
    poll_interval: float = _DEFAULT_POLL_INTERVAL_S,
    on_poll: Callable[[], None] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    """Run *cmd* to completion, polling so it can be cancelled mid-flight.

    Behaves like ``subprocess.run(cmd, capture_output=True, timeout=timeout,
    env=env)`` when the process finishes on its own — same
    ``CompletedProcess(args, returncode, stdout, stderr)`` return shape.

    Differs in two cases:
    - If ``cancel.is_cancelled`` becomes true while the process is running,
      the process group is terminated (SIGTERM, then SIGKILL after a grace
      period) and ``InterruptedError`` is raised. Never returns a
      CompletedProcess for a cancelled run.
    - If *timeout* elapses without cancellation, the process group is
      terminated and ``subprocess.TimeoutExpired`` is raised (matching
      ``subprocess.run``'s own timeout behavior).

    If *on_poll* is given, it is called once per poll iteration (roughly
    every *poll_interval* seconds) while the process is still running —
    BE-54 uses this hook to tail the solver's growing raw output file mid-run
    for live waveform streaming. Exceptions from *on_poll* propagate (the
    process group is terminated first, matching the cancellation/timeout
    cleanup paths below).

    *cwd*, when given, is the subprocess's working directory — needed by any solver whose
    netlist can reference a companion file by a relative path (`general-simulator`'s own
    `kind=pyblock`/`cscript`/`octfunc` `path=`), since the netlist file itself is usually
    written into a throwaway temp directory that has no relationship to wherever those
    companion files actually live.
    """
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        cwd=cwd,
        start_new_session=True,
    )

    deadline = time.monotonic() + timeout
    try:
        while True:
            if cancel is not None and cancel.is_cancelled:
                _terminate_process_group(proc, _TERMINATE_GRACE_S)
                raise InterruptedError("Simulation cancelled by user.")

            if on_poll is not None:
                on_poll()

            try:
                stdout, stderr = proc.communicate(timeout=poll_interval)
            except subprocess.TimeoutExpired:
                if time.monotonic() >= deadline:
                    _terminate_process_group(proc, _TERMINATE_GRACE_S)
                    raise subprocess.TimeoutExpired(cmd, timeout) from None
                continue

            returncode = proc.returncode
            assert returncode is not None
            return subprocess.CompletedProcess(cmd, returncode, stdout, stderr)
    except BaseException:
        if proc.poll() is None:
            _terminate_process_group(proc, _TERMINATE_GRACE_S)
        raise
