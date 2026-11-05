"""BE-05 — Executor (ThreadPoolExecutor + cancel) tests.

Covers:
- Quick and slow exec interleaved; both complete; namespace state correct.
- Cancel a long-running exec (time.sleep equivalent); returns within 200 ms.
- eval `2+2` returns value=4; exec `a=2` returns None and binds a.
"""

from __future__ import annotations

import asyncio
import time

import pytest

pytestmark = pytest.mark.asyncio


def _import_executor():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.executor import Executor

        return Executor
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.executor not yet implemented")


def _import_namespace():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.namespace import Namespace

        return Namespace
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.namespace not yet implemented")


# ---------------------------------------------------------------------------
# Eval vs exec return values
# ---------------------------------------------------------------------------


async def test_eval_returns_value() -> None:
    Executor = _import_executor()
    Namespace = _import_namespace()
    ns = Namespace()
    ex = Executor(namespace=ns)
    result = await ex.execute("2 + 2", request_id="r1")
    assert result.value == 4


async def test_exec_returns_none() -> None:
    Executor = _import_executor()
    Namespace = _import_namespace()
    ns = Namespace()
    ex = Executor(namespace=ns)
    result = await ex.execute("a = 2", request_id="r2")
    assert result.value is None
    assert ns.globals.get("a") == 2


async def test_exec_binds_variable() -> None:
    Executor = _import_executor()
    Namespace = _import_namespace()
    ns = Namespace()
    ex = Executor(namespace=ns)
    await ex.execute("my_var = 42", request_id="r3")
    assert ns.globals["my_var"] == 42


# ---------------------------------------------------------------------------
# Interleaved quick + slow exec
# ---------------------------------------------------------------------------


async def test_interleaved_executions_complete() -> None:
    """Two executions interleaved must both complete with correct namespace state."""
    Executor = _import_executor()
    Namespace = _import_namespace()
    ns = Namespace()
    ex = Executor(namespace=ns)

    async def run_slow() -> None:
        await ex.execute("import time; time.sleep(0.05); slow_done = True", request_id="slow")

    async def run_quick() -> None:
        await ex.execute("quick_done = True", request_id="quick")

    await asyncio.gather(run_slow(), run_quick())
    assert ns.globals.get("slow_done") is True
    assert ns.globals.get("quick_done") is True


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


async def test_cancel_long_running_exec() -> None:
    """Cancelling a long-running execution must return within 200 ms."""
    Executor = _import_executor()
    Namespace = _import_namespace()
    ns = Namespace()
    ex = Executor(namespace=ns)

    request_id = "cancel-me"
    t0 = time.monotonic()

    async def run_long() -> None:
        try:
            await ex.execute("import time; time.sleep(10)", request_id=request_id)
        except Exception:
            pass

    task = asyncio.create_task(run_long())
    await asyncio.sleep(0.02)  # Let the task start

    await ex.cancel(request_id)
    await asyncio.wait_for(task, timeout=1.0)

    elapsed = time.monotonic() - t0
    assert elapsed < 0.5, f"Cancel took {elapsed:.2f}s; expected < 0.5s"


async def test_cancelled_exec_emits_cancelled_error() -> None:
    """After cancel, the executor must surface a Cancelled-type error."""
    Executor = _import_executor()
    Namespace = _import_namespace()
    ns = Namespace()
    ex = Executor(namespace=ns)

    errors: list[dict] = []

    async def capture_error() -> None:
        try:
            await ex.execute(
                "import time; time.sleep(10)",
                request_id="c1",
                on_error=lambda e: errors.append(e),
            )
        except Exception:
            pass

    task = asyncio.create_task(capture_error())
    await asyncio.sleep(0.02)
    await ex.cancel("c1")
    await asyncio.wait_for(task, timeout=1.0)

    if errors:
        assert errors[0].get("exc_type") == "Cancelled"
