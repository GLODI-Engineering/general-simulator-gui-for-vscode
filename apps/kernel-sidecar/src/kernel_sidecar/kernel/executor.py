"""ThreadPoolExecutor-based code executor (BE-05).

Runs user code in worker threads while the event loop remains responsive.
Supports per-request cancellation via cancel tokens.
"""

from __future__ import annotations

import asyncio
import ctypes
import logging
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from kernel_sidecar.kernel.namespace import Namespace
from kernel_sidecar.kernel.stdout import stream_capture

logger = logging.getLogger(__name__)


def _raise_in_thread(thread_id: int, exc_type: type) -> int:
    """Raise exc_type asynchronously in the thread identified by thread_id.

    Returns the number of threads affected (1 = success, 0 = thread not found).
    """
    return int(
        ctypes.pythonapi.PyThreadState_SetAsyncExc(
            ctypes.c_ulong(thread_id),
            ctypes.py_object(exc_type),
        )
    )


class CancelToken:
    def __init__(self) -> None:
        self._cancelled = threading.Event()
        self._thread_id: int | None = None

    def register_thread(self, thread_id: int) -> None:
        self._thread_id = thread_id

    def cancel(self) -> None:
        self._cancelled.set()
        if self._thread_id is not None:
            _raise_in_thread(self._thread_id, InterruptedError)

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled.is_set()


class ExecuteResult:
    def __init__(
        self,
        *,
        status: str = "ok",
        value: Any = None,
        exc_type: str | None = None,
        message: str | None = None,
        tb: str | None = None,
    ) -> None:
        self.status = status
        self.value = value
        self.exc_type = exc_type
        self.message = message
        self.traceback = tb


def _noop_stream_cb(request_id: str, stream: str, chunk: str) -> None:
    pass


def _run_code(
    code: str,
    ns: Namespace,
    cancel_token: CancelToken,
    stream_cb: Any,
    request_id: str,
) -> ExecuteResult:
    """Execute code in the calling thread (pool worker)."""
    # Register this thread so cancel() can raise InterruptedError in it.
    cancel_token.register_thread(threading.current_thread().ident or 0)
    cb = stream_cb if stream_cb is not None else _noop_stream_cb
    with stream_capture(request_id, cb):
        with ns.lock:
            g = ns.get_globals()
        # Try eval mode first (returns a value for expressions)
        try:
            compiled = compile(code, "<input>", "eval")
            with ns.lock:
                g = ns.get_globals()
                value = eval(compiled, g)
            return ExecuteResult(value=value)
        except SyntaxError:
            pass

        # Fall back to exec mode
        try:
            compiled = compile(code, "<input>", "exec")
            with ns.lock:
                g = ns.get_globals()
                exec(compiled, g)
            if cancel_token.is_cancelled:
                return ExecuteResult(
                    status="error",
                    exc_type="Cancelled",
                    message="Execution was cancelled.",
                    tb="",
                )
            return ExecuteResult()
        except Exception as exc:
            if cancel_token.is_cancelled or isinstance(exc, InterruptedError):
                return ExecuteResult(
                    status="error",
                    exc_type="Cancelled",
                    message="Execution was cancelled.",
                    tb="",
                )
            return ExecuteResult(
                status="error",
                exc_type=type(exc).__name__,
                message=str(exc),
                tb=traceback.format_exc(),
            )


class Executor:
    def __init__(
        self,
        max_workers: int = 4,
        namespace: Namespace | None = None,
    ) -> None:
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="kernel-exec")
        self._active_tokens: dict[str, CancelToken] = {}
        self._active_futures: dict[str, asyncio.Future[ExecuteResult]] = {}
        self._lock = threading.Lock()
        self._default_namespace = namespace

    async def cancel(self, request_id: str) -> None:
        """Cancel a pending request by id (async wrapper for awaitable callers)."""
        with self._lock:
            token = self._active_tokens.get(request_id)
            future = self._active_futures.get(request_id)
        if token:
            token.cancel()
        if future and not future.done():
            future.cancel()

    async def execute(
        self,
        code: str,
        request_id: str,
        ns: Namespace | None = None,
        stream_cb: Any = None,
        on_error: Any = None,
    ) -> ExecuteResult:
        effective_ns = ns or self._default_namespace
        if effective_ns is None:
            raise ValueError("No namespace provided to execute().")
        token = CancelToken()
        with self._lock:
            self._active_tokens[request_id] = token
        try:
            loop = asyncio.get_running_loop()
            future: asyncio.Future[ExecuteResult] = loop.run_in_executor(
                self._pool,
                _run_code,
                code,
                effective_ns,
                token,
                stream_cb,
                request_id,
            )
            with self._lock:
                self._active_futures[request_id] = future
            try:
                result: ExecuteResult = await future
            except asyncio.CancelledError:
                result = ExecuteResult(
                    status="error",
                    exc_type="Cancelled",
                    message="Execution was cancelled.",
                    tb="",
                )
            if on_error is not None and result.status == "error":
                on_error({"exc_type": result.exc_type, "message": result.message})
            return result
        finally:
            with self._lock:
                self._active_tokens.pop(request_id, None)
                self._active_futures.pop(request_id, None)

    def cancel_all(self) -> None:
        """Cancel every pending request (used on kernel_restart)."""
        with self._lock:
            for token in self._active_tokens.values():
                token.cancel()
            for future in self._active_futures.values():
                if not future.done():
                    future.cancel()
