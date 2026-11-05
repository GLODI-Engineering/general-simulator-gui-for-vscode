"""Atomic JSON settings file manager.

Manages <app-data>/settings.json with atomic write-tmp + rename to
prevent corruption on concurrent writes.
"""

from __future__ import annotations

import contextlib
import json
import os
import pathlib
import tempfile
import threading
from typing import Any


class Settings:
    """Persistent JSON settings with atomic writes."""

    def __init__(self, path: pathlib.Path) -> None:
        self._path = path
        self._lock = threading.Lock()
        self._data: dict[str, Any] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            try:
                with self._path.open("r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except (json.JSONDecodeError, OSError):
                self._data = {}

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = value
            self._write_atomic()

    def as_dict(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._data)

    def _write_atomic(self) -> None:
        """Write settings to a temp file then atomically rename it."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=self._path.parent, prefix=".settings-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, sort_keys=True)
            os.replace(tmp_path, self._path)
        except Exception:
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)
            raise


def default_settings_path() -> pathlib.Path:
    """Return <app-data>/settings.json using platform conventions."""
    xdg = os.environ.get("XDG_DATA_HOME")
    base = pathlib.Path(xdg) if xdg else pathlib.Path.home() / ".local" / "share"
    return base / "general-simulator" / "settings.json"
