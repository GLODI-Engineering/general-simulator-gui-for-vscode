"""Matplotlib figure capture (BE-08).

Monkey-patches pyplot.show() and tracks figures created per-request.
After execution, renders each pending figure to base64 PNG and closes it.
The Agg backend is forced to prevent popup windows.
"""

from __future__ import annotations

import base64
import contextvars
import io
from typing import Any

import matplotlib

matplotlib.use("Agg")  # Must be set before pyplot import.

import matplotlib.pyplot as plt

# Context variable: list of pending figures for the current request.
_pending_figures: contextvars.ContextVar[list[Any] | None] = contextvars.ContextVar(
    "_pending_figures", default=None
)

_patched = False


def _install_hooks() -> None:
    """Install monkey-patches on pyplot. Idempotent."""
    global _patched
    if _patched:
        return
    _patched = True

    _original_show = plt.show

    def _show(*args: Any, **kwargs: Any) -> None:
        # Do nothing — figures are captured after execute, not on show().
        pass

    plt.show = _show

    _original_figure = plt.figure

    def _figure(*args: Any, **kwargs: Any) -> Any:
        fig = _original_figure(*args, **kwargs)
        pending = _pending_figures.get()
        if pending is not None:
            pending.append(fig)
        return fig

    plt.figure = _figure


def begin_capture() -> None:
    """Start capturing figures for the current request context."""
    _install_hooks()
    _pending_figures.set([])


def collect_figures() -> list[str]:
    """Render all pending figures to base64 PNG and return them.

    Closes each figure after rendering to prevent memory leaks.
    """
    pending = _pending_figures.get()
    if pending is None:
        return []
    results: list[str] = []
    for fig in pending:
        buf = io.BytesIO()
        try:
            fig.savefig(buf, format="png")
            buf.seek(0)
            results.append(base64.b64encode(buf.read()).decode("ascii"))
        finally:
            plt.close(fig)
    _pending_figures.set([])
    return results


class _CaptureContext:
    """Context manager for MatplotlibHook.capture_context()."""

    def __init__(self, request_id: str) -> None:
        self._request_id = request_id
        self._figures: list[dict[str, str]] = []
        self._token: Any = None

    def __enter__(self) -> list[dict[str, str]]:
        self._token = _pending_figures.set([])
        return self._figures

    def __exit__(self, *_: Any) -> None:
        b64_list = collect_figures()
        for b64 in b64_list:
            self._figures.append({"format": "png", "data": b64})
        if self._token is not None:
            _pending_figures.reset(self._token)


class MatplotlibHook:
    """Class-based interface for matplotlib figure capture (used by tests)."""

    def install(self) -> None:
        """Install matplotlib patches. Idempotent."""
        _install_hooks()

    def capture_context(self, request_id: str) -> _CaptureContext:
        """Return a context manager that captures figures and appends to yielded list."""
        self.install()
        return _CaptureContext(request_id)
