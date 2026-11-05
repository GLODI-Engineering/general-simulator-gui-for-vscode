"""BE-53 — cancellable SPICE subprocess execution.

Covers:
- run_cancellable() behaves like subprocess.run() for a process that exits
  on its own.
- run_cancellable() raises InterruptedError and actually terminates the
  process when cancelled mid-flight, well before the process would have
  exited naturally.
- run_cancellable() raises subprocess.TimeoutExpired and terminates the
  process when the overall timeout elapses without cancellation.
- NgspiceSolver.solve() and XyceSolver.solve(), pointed at a fake sleeping
  binary, actually stop quickly on cancellation instead of blocking until
  the fake binary's sleep completes.
"""

from __future__ import annotations

import pathlib
import stat
import subprocess
import threading
import time

import pytest

from simulator.solvers._subprocess_run import default_solver_timeout_seconds, run_cancellable
from simulator.solvers.protocol import CancelToken, SolverOptions


def _write_sleep_script(path: pathlib.Path, seconds: float) -> None:
    path.write_text(f"#!/bin/sh\nsleep {seconds}\nexit 0\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


def _write_ngspice_stub(path: pathlib.Path, seconds: float) -> None:
    """A fake 'ngspice' that ignores its args and just sleeps, writing an
    empty (invalid) raw file at exit so a would-be parse step has something
    to fail on if the test forgot to cancel — but every test here cancels
    before that point.
    """
    path.write_text(f"#!/bin/sh\nsleep {seconds}\nexit 0\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


# ---------------------------------------------------------------------------
# default_solver_timeout_seconds() — TRAN vs non-TRAN analyses
# ---------------------------------------------------------------------------
#
# Regression coverage for a real bug: NgspiceSolver/XyceSolver both computed
# their subprocess wall-clock timeout as max(options.t_end * 1000, 60)
# unconditionally — but t_end only means anything for a TRAN analysis. A DC
# or AC run inherits whatever t_end the UI's simulation-settings panel last
# held (the frontend sends it unconditionally, regardless of the netlist's
# actual analysis card), which could be a large stale value from an earlier
# TRAN run — silently handing a DC sweep an hours-long subprocess timeout
# instead of a sane fixed ceiling. Reported live: importing and running a
# `.DC` SPICE netlist hung well past the frontend's own 120s
# no-response timeout with nothing ever coming back from the backend.


def test_tran_timeout_scales_with_t_end() -> None:
    assert default_solver_timeout_seconds("TRAN", 0.01) == 60  # floor
    assert default_solver_timeout_seconds("TRAN", 1.0) == 1000  # 1000x t_end


def test_dc_analysis_uses_a_fixed_ceiling_regardless_of_t_end() -> None:
    # A DC sweep with a large stale t_end (left over from an earlier TRAN
    # run) must not inherit a multi-hour timeout from it.
    assert default_solver_timeout_seconds("DC", 3600.0) == 120.0
    # ...nor a tiny one from the default t_end cutting off a legitimate sweep.
    assert default_solver_timeout_seconds("DC", 0.01) == 120.0


def test_ac_op_analyses_also_use_the_fixed_ceiling() -> None:
    assert default_solver_timeout_seconds("AC", 5.0) == 120.0
    assert default_solver_timeout_seconds("OP", 5.0) == 120.0


def test_analysis_type_is_case_insensitive() -> None:
    assert default_solver_timeout_seconds("tran", 1.0) == 1000
    assert default_solver_timeout_seconds("dc", 3600.0) == 120.0


# ---------------------------------------------------------------------------
# run_cancellable() — direct tests
# ---------------------------------------------------------------------------


def test_run_cancellable_returns_like_subprocess_run_when_uncancelled() -> None:
    result = run_cancellable(["/bin/echo", "hello"], timeout=5.0)
    assert result.returncode == 0
    assert result.stdout.strip() == b"hello"


def test_run_cancellable_propagates_nonzero_exit() -> None:
    result = run_cancellable(["/bin/sh", "-c", "exit 7"], timeout=5.0)
    assert result.returncode == 7


def test_run_cancellable_cancelled_mid_flight_raises_and_terminates_quickly(
    tmp_path: pathlib.Path,
) -> None:
    script = tmp_path / "slow.sh"
    _write_sleep_script(script, seconds=10.0)

    cancel = CancelToken()

    def _cancel_soon() -> None:
        time.sleep(0.3)
        cancel.cancel()

    threading.Thread(target=_cancel_soon, daemon=True).start()

    start = time.monotonic()
    with pytest.raises(InterruptedError):
        run_cancellable([str(script)], timeout=30.0, cancel=cancel, poll_interval=0.05)
    elapsed = time.monotonic() - start

    assert elapsed < 2.0, f"Cancellation took too long: {elapsed:.2f}s (script sleeps 10s)"


def test_run_cancellable_timeout_without_cancellation_terminates_and_raises(
    tmp_path: pathlib.Path,
) -> None:
    script = tmp_path / "slow.sh"
    _write_sleep_script(script, seconds=10.0)

    start = time.monotonic()
    with pytest.raises(subprocess.TimeoutExpired):
        run_cancellable([str(script)], timeout=0.5, poll_interval=0.05)
    elapsed = time.monotonic() - start

    assert elapsed < 2.0, f"Timeout enforcement took too long: {elapsed:.2f}s"


def test_run_cancellable_process_actually_dies_on_cancel(tmp_path: pathlib.Path) -> None:
    script = tmp_path / "slow.sh"
    _write_sleep_script(script, seconds=10.0)
    marker = tmp_path / "still_running"
    marker.write_text("1")

    proc_holder: dict[str, subprocess.Popen[bytes]] = {}

    import simulator.solvers._subprocess_run as run_module

    original_popen = subprocess.Popen

    def _tracking_popen(*args, **kwargs):  # type: ignore[no-untyped-def]
        proc = original_popen(*args, **kwargs)
        proc_holder["proc"] = proc
        return proc

    run_module.subprocess.Popen = _tracking_popen  # type: ignore[assignment]
    try:
        cancel = CancelToken()
        cancel.cancel()  # cancel before launch is even observed by the poll loop
        with pytest.raises(InterruptedError):
            run_cancellable([str(script)], timeout=30.0, cancel=cancel, poll_interval=0.05)
    finally:
        run_module.subprocess.Popen = original_popen

    proc = proc_holder["proc"]
    # Give the OS a moment to reap; the process must not still be running.
    for _ in range(20):
        if proc.poll() is not None:
            break
        time.sleep(0.1)
    assert proc.poll() is not None, "Process must be terminated after cancellation"


def test_run_cancellable_calls_on_poll_each_iteration_while_running(
    tmp_path: pathlib.Path,
) -> None:
    script = tmp_path / "slow.sh"
    _write_sleep_script(script, seconds=1.0)

    poll_count = 0

    def _on_poll() -> None:
        nonlocal poll_count
        poll_count += 1

    result = run_cancellable([str(script)], timeout=5.0, poll_interval=0.05, on_poll=_on_poll)

    assert result.returncode == 0
    # A 1s sleep polled every 0.05s should yield well over one on_poll call.
    assert poll_count > 3, f"Expected multiple on_poll calls, got {poll_count}"


def test_run_cancellable_on_poll_omitted_by_default() -> None:
    # No on_poll given — must behave exactly as before (BE-53 regression guard).
    result = run_cancellable(["/bin/echo", "hi"], timeout=5.0)
    assert result.returncode == 0


# ---------------------------------------------------------------------------
# NgspiceSolver / XyceSolver — cancellation reaches the subprocess
# ---------------------------------------------------------------------------


def test_ngspice_solver_cancel_stops_fake_binary_quickly(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver

    fake_ngspice = tmp_path / "ngspice"
    _write_ngspice_stub(fake_ngspice, seconds=10.0)

    solver = NgspiceSolver(fake_ngspice)
    cancel = CancelToken()

    def _cancel_soon() -> None:
        time.sleep(0.3)
        cancel.cancel()

    threading.Thread(target=_cancel_soon, daemon=True).start()

    start = time.monotonic()
    with pytest.raises(InterruptedError):
        solver.solve(
            "* empty netlist\n.END\n",
            sim_id="cancel-test",
            options=SolverOptions(t_end=1.0),
            cancel=cancel,
        )
    elapsed = time.monotonic() - start

    assert elapsed < 3.0, f"ngspice cancellation took too long: {elapsed:.2f}s (stub sleeps 10s)"


def test_xyce_solver_cancel_stops_fake_binary_quickly(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.xyce_solver import XyceSolver

    fake_xyce = tmp_path / "Xyce"
    _write_ngspice_stub(fake_xyce, seconds=10.0)

    solver = XyceSolver(fake_xyce)
    cancel = CancelToken()

    def _cancel_soon() -> None:
        time.sleep(0.3)
        cancel.cancel()

    threading.Thread(target=_cancel_soon, daemon=True).start()

    start = time.monotonic()
    with pytest.raises(InterruptedError):
        solver.solve(
            "* empty netlist\n.END\n",
            sim_id="cancel-test",
            options=SolverOptions(t_end=1.0),
            cancel=cancel,
        )
    elapsed = time.monotonic() - start

    assert elapsed < 3.0, f"Xyce cancellation took too long: {elapsed:.2f}s (stub sleeps 10s)"
