"""Per-request stdout/stderr interceptor (BE-06).

Each write emits an execute_stream message tagged with the originating
request id. Two concurrent execute requests have their output routed
independently via contextvars.
"""

from __future__ import annotations

import asyncio
import contextvars
import io
import sys
from collections.abc import Callable
from typing import Any

# Context variable: per-request async callback for stream chunks.
# Signature: (request_id: str, stream: str, chunk: str) -> Coroutine
_stream_callback: contextvars.ContextVar[Callable[[str, str, str], Any] | None] = (
    contextvars.ContextVar("_stream_callback", default=None)
)

_request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_request_id_var", default=None
)


class _RoutingStream(io.TextIOBase):
    """TextIOBase that routes writes to the per-request callback."""

    def __init__(self, stream_name: str) -> None:
        self._stream_name = stream_name

    def write(self, s: str) -> int:
        if not s:
            return 0
        cb = _stream_callback.get()
        req_id = _request_id_var.get()
        if cb is not None and req_id is not None:
            # Schedule the coroutine on the running event loop if possible.
            try:
                loop = asyncio.get_running_loop()
                loop.call_soon_threadsafe(
                    lambda: loop.create_task(cb(req_id, self._stream_name, s))
                )
            except RuntimeError:
                pass
        return len(s)

    def flush(self) -> None:
        pass  # On-write delivery; no buffering.


_routing_stdout = _RoutingStream("stdout")
_routing_stderr = _RoutingStream("stderr")


class _StreamCapture:
    """Context manager that installs the per-request routing stream."""

    def __init__(
        self,
        request_id: str,
        callback: Callable[[str, str, str], Any],
    ) -> None:
        self._request_id = request_id
        self._callback = callback
        self._token_cb: contextvars.Token[Any] | None = None
        self._token_id: contextvars.Token[Any] | None = None
        self._old_stdout: Any = None
        self._old_stderr: Any = None

    def __enter__(self) -> _StreamCapture:
        self._token_cb = _stream_callback.set(self._callback)
        self._token_id = _request_id_var.set(self._request_id)
        self._old_stdout = sys.stdout
        self._old_stderr = sys.stderr
        sys.stdout = _routing_stdout
        sys.stderr = _routing_stderr
        return self

    def __exit__(self, *_: object) -> None:
        sys.stdout = self._old_stdout
        sys.stderr = self._old_stderr
        if self._token_cb is not None:
            _stream_callback.reset(self._token_cb)
        if self._token_id is not None:
            _request_id_var.reset(self._token_id)


def stream_capture(
    request_id: str,
    callback: Callable[[str, str, str], Any],
) -> _StreamCapture:
    """Return a context manager that routes stdout/stderr for request_id."""
    return _StreamCapture(request_id, callback)


# ---------------------------------------------------------------------------
# stdout_router — simpler context manager for tests (on_chunk receives chunk)
# ---------------------------------------------------------------------------

_sync_callback: contextvars.ContextVar[Callable[[str], None] | None] = contextvars.ContextVar(
    "_sync_callback", default=None
)

# Per-context line buffer so that print()'s separate text/"\n" writes arrive as one chunk.
_sync_buffer: contextvars.ContextVar[str] = contextvars.ContextVar("_sync_buffer", default="")


class _SyncRoutingStream(io.TextIOBase):
    def __init__(self) -> None:
        pass

    def write(self, s: str) -> int:
        if not s:
            return 0
        cb = _sync_callback.get()
        if cb is None:
            return len(s)
        # Buffer until we hold a complete line (ends with '\n') to avoid splitting
        # print()'s text write from its separate '\n' write into two chunks.
        buf = _sync_buffer.get() + s
        if buf.endswith("\n"):
            _sync_buffer.set("")
            cb(buf)
        else:
            _sync_buffer.set(buf)
        return len(s)

    def flush(self) -> None:
        # Flush any remaining partial line.
        cb = _sync_callback.get()
        buf = _sync_buffer.get()
        if cb is not None and buf:
            _sync_buffer.set("")
            cb(buf)


_sync_routing_stdout = _SyncRoutingStream()
_sync_routing_stderr = _SyncRoutingStream()


class _StdoutRouter:
    def __init__(self, request_id: str, on_chunk: Callable[[str], None]) -> None:
        self._request_id = request_id
        self._on_chunk = on_chunk
        self._token: contextvars.Token[Callable[[str], None] | None] | None = None
        self._old_stdout: Any = None
        self._old_stderr: Any = None

    def __enter__(self) -> _StdoutRouter:
        self._token = _sync_callback.set(self._on_chunk)
        self._old_stdout = sys.stdout
        self._old_stderr = sys.stderr
        sys.stdout = _sync_routing_stdout
        sys.stderr = _sync_routing_stderr
        return self

    def __exit__(self, *_: object) -> None:
        # Flush any partial line before restoring streams.
        _sync_routing_stdout.flush()
        _sync_routing_stderr.flush()
        sys.stdout = self._old_stdout
        sys.stderr = self._old_stderr
        if self._token is not None:
            _sync_callback.reset(self._token)


def stdout_router(request_id: str, on_chunk: Callable[[str], None]) -> _StdoutRouter:
    """Return a context manager that routes stdout/stderr writes to on_chunk(chunk)."""
    return _StdoutRouter(request_id, on_chunk)
