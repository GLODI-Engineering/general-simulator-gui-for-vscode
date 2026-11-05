"""Persistent Python namespace for the kernel REPL (BE-04).

Pre-imports numpy, scipy, matplotlib.pyplot, pandas, sympy and convenience
aliases. User-set names persist across execute calls. kernel_restart resets
user names but restores pre-imports.
"""

from __future__ import annotations

import threading
from typing import Any

# Names injected at reset time — not stored as actual globals here.
_PRE_IMPORT_NAMES: frozenset[str] = frozenset(
    [
        "np",
        "scipy",
        "plt",
        "pd",
        "sympy",
        "pi",
        "e",
    ]
)


def _make_defaults() -> dict[str, Any]:
    import matplotlib.pyplot as plt
    import numpy as np
    import pandas as pd
    import scipy
    import sympy
    from numpy import e, pi

    return {
        "np": np,
        "scipy": scipy,
        "plt": plt,
        "pd": pd,
        "sympy": sympy,
        "pi": pi,
        "e": e,
    }


class Namespace:
    """Thread-safe global namespace for user code execution."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._globals: dict[str, Any] = {}
        self._initialized = False

    def _ensure_initialized(self) -> None:
        """Lazy-initialize pre-imports on first use (defers heavy imports)."""
        if not self._initialized:
            with self._lock:
                if not self._initialized:
                    self._reset_locked()
                    self._initialized = True

    def _reset_locked(self) -> None:
        """Rebuild globals from defaults. Must be called with lock held."""
        self._globals.clear()
        self._globals.update(_make_defaults())
        self._initialized = True

    def reset(self) -> None:
        """Clear all user names and restore pre-imports."""
        with self._lock:
            self._reset_locked()

    def get_globals(self) -> dict[str, Any]:
        """Return a reference to the globals dict (caller must hold the lock)."""
        self._ensure_initialized()
        return self._globals

    def exec(self, code: str) -> None:
        """Execute code string in this namespace (convenience for tests)."""
        self._ensure_initialized()
        compiled = compile(code, "<namespace.exec>", "exec")
        with self._lock:
            exec(compiled, self._globals)

    @property
    def globals(self) -> dict[str, Any]:
        """Public read-only view of the globals dict."""
        self._ensure_initialized()
        with self._lock:
            return dict(self._globals)

    @property
    def lock(self) -> threading.RLock:
        return self._lock

    def user_names(self) -> set[str]:
        """Return names set by user code (excludes pre-imports and dunders)."""
        self._ensure_initialized()
        with self._lock:
            return {
                k for k in self._globals if not k.startswith("__") and k not in _PRE_IMPORT_NAMES
            }


PRE_IMPORT_NAMES = _PRE_IMPORT_NAMES
