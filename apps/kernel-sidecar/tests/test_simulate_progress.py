"""Progress-heartbeat tests for the simulate handler.

SPICE backends run as opaque blocking subprocesses, so the handler surfaces a
time-based heartbeat (_run_with_heartbeat) instead of leaving the UI progress
bar pinned at 0. These tests exercise that helper directly — no solver needed.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from kernel_sidecar.ipc.handlers.simulate import _run_with_heartbeat

pytestmark = pytest.mark.asyncio


async def test_heartbeat_emits_monotonic_progress_for_slow_solve() -> None:
    loop = asyncio.get_running_loop()
    emitted: list[float] = []

    async def emit(frac: float) -> None:
        emitted.append(frac)

    def slow() -> str:
        time.sleep(1.0)
        return "RESULT"

    result = await _run_with_heartbeat(loop, slow, emit)

    assert result == "RESULT"
    assert emitted[0] == 0.0
    assert emitted[-1] == 1.0
    mids = emitted[1:-1]
    assert len(mids) >= 1  # at least one intermediate heartbeat for a ~1s solve
    assert all(0.0 < m < 1.0 for m in mids)
    assert mids == sorted(mids)  # monotonic non-decreasing


async def test_heartbeat_fast_solve_reports_start_and_done() -> None:
    loop = asyncio.get_running_loop()
    emitted: list[float] = []

    async def emit(frac: float) -> None:
        emitted.append(frac)

    result = await _run_with_heartbeat(loop, lambda: 42, emit)

    assert result == 42
    assert emitted[0] == 0.0
    assert emitted[-1] == 1.0
    assert all(x <= 1.0 for x in emitted)


async def test_heartbeat_propagates_solver_error_without_completion() -> None:
    loop = asyncio.get_running_loop()
    emitted: list[float] = []

    async def emit(frac: float) -> None:
        emitted.append(frac)

    def boom() -> str:
        time.sleep(0.5)
        raise RuntimeError("solver failed")

    with pytest.raises(RuntimeError, match="solver failed"):
        await _run_with_heartbeat(loop, boom, emit)

    assert emitted[0] == 0.0
    assert 1.0 not in emitted  # no false "complete" on failure
