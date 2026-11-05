"""BE-01 — Settings module tests.

Covers:
- Round-trip: write → read returns the same dict.
- Atomic write: uses tmp + rename (no partial write corruption).
- Concurrent writes don't corrupt the file.
- default_settings_path respects XDG_DATA_HOME.
"""

from __future__ import annotations

import json
import pathlib
import threading

import pytest

from kernel_sidecar.config.settings import Settings, default_settings_path

# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------


def test_set_then_get(tmp_path: pathlib.Path) -> None:
    s = Settings(tmp_path / "settings.json")
    s.set("foo", 42)
    assert s.get("foo") == 42


def test_round_trip_persist(tmp_path: pathlib.Path) -> None:
    """Write a value, reload from disk, assert it survives."""
    path = tmp_path / "settings.json"
    s1 = Settings(path)
    s1.set("alpha", {"nested": True})
    s1.set("count", 99)

    s2 = Settings(path)
    assert s2.get("alpha") == {"nested": True}
    assert s2.get("count") == 99


def test_as_dict(tmp_path: pathlib.Path) -> None:
    s = Settings(tmp_path / "settings.json")
    s.set("x", 1)
    s.set("y", 2)
    d = s.as_dict()
    assert d == {"x": 1, "y": 2}


def test_default_returns_none_for_missing(tmp_path: pathlib.Path) -> None:
    s = Settings(tmp_path / "settings.json")
    assert s.get("nonexistent") is None
    assert s.get("nonexistent", "fallback") == "fallback"


# ---------------------------------------------------------------------------
# Atomic write
# ---------------------------------------------------------------------------


def test_atomic_write_no_tmp_leftover(tmp_path: pathlib.Path) -> None:
    """After a successful write, no .tmp files should remain."""
    path = tmp_path / "settings.json"
    s = Settings(path)
    s.set("k", "v")
    leftovers = list(tmp_path.glob("*.tmp"))
    assert leftovers == [], f"Leftover tmp files: {leftovers}"


def test_written_file_is_valid_json(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "settings.json"
    s = Settings(path)
    s.set("hello", "world")
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    assert parsed["hello"] == "world"


def test_atomic_write_uses_os_replace(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify os.replace is called (proxy for atomic rename strategy)."""
    import os

    calls: list[tuple[str, str]] = []
    original_replace = os.replace

    def spy_replace(src: str, dst: str) -> None:
        calls.append((src, dst))
        original_replace(src, dst)

    monkeypatch.setattr(os, "replace", spy_replace)
    s = Settings(tmp_path / "settings.json")
    s.set("x", 1)
    assert len(calls) >= 1, "os.replace was not called during atomic write"


# ---------------------------------------------------------------------------
# Concurrent writes
# ---------------------------------------------------------------------------


def test_concurrent_writes_do_not_corrupt(tmp_path: pathlib.Path) -> None:
    """Hammering writes from many threads must not produce a corrupt file."""
    path = tmp_path / "settings.json"
    s = Settings(path)
    errors: list[Exception] = []

    def writer(i: int) -> None:
        try:
            for j in range(20):
                s.set(f"key_{i}", j)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=writer, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"Exceptions during concurrent writes: {errors}"

    # The file must still parse as valid JSON after the storm.
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    assert isinstance(parsed, dict)


# ---------------------------------------------------------------------------
# default_settings_path
# ---------------------------------------------------------------------------


def test_default_path_respects_xdg(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> None:
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    path = default_settings_path()
    assert path == tmp_path / "general-simulator" / "settings.json"


def test_default_path_falls_back_to_home(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    path = default_settings_path()
    assert path.name == "settings.json"
    assert "general-simulator" in str(path)


def test_missing_settings_file_loads_empty(tmp_path: pathlib.Path) -> None:
    """Constructing Settings against a non-existent file must not raise."""
    s = Settings(tmp_path / "no_such_file.json")
    assert s.as_dict() == {}


def test_corrupt_settings_file_loads_empty(tmp_path: pathlib.Path) -> None:
    """A corrupt JSON file must not raise; it resets to empty."""
    path = tmp_path / "settings.json"
    path.write_text("{not valid json", encoding="utf-8")
    s = Settings(path)
    assert s.as_dict() == {}
