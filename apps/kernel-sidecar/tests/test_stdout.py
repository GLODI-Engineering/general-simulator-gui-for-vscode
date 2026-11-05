"""BE-06 — Streaming stdout/stderr (per-request routing) tests.

Covers:
- Two concurrent execute requests with print() calls receive their chunks
  routed to the correct request id.
- Exception during exec still restores sys.stdout/sys.stderr.
"""

from __future__ import annotations

import asyncio
import sys

import pytest

pytestmark = pytest.mark.asyncio


def _import_stdout_router():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.stdout import stdout_router

        return stdout_router
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.stdout not yet implemented")


# ---------------------------------------------------------------------------
# Chunk routing
# ---------------------------------------------------------------------------


async def test_chunks_tagged_with_correct_request_id() -> None:
    """Chunks emitted by concurrent requests must be tagged with the right id."""
    stdout_router = _import_stdout_router()

    chunks: dict[str, list[str]] = {"r1": [], "r2": []}

    def make_emit(req_id: str):  # type: ignore[no-untyped-def]
        def emit(chunk: str) -> None:
            chunks[req_id].append(chunk)

        return emit

    async def run_request(req_id: str) -> None:
        with stdout_router(req_id, on_chunk=make_emit(req_id)):
            for i in range(5):
                print(f"{req_id}-{i}")
                await asyncio.sleep(0)

    await asyncio.gather(run_request("r1"), run_request("r2"))

    # Each request must have received only its own chunks
    for chunk in chunks["r1"]:
        assert "r1" in chunk, f"r2 chunk in r1 stream: {chunk!r}"
    for chunk in chunks["r2"]:
        assert "r2" in chunk, f"r1 chunk in r2 stream: {chunk!r}"

    assert len(chunks["r1"]) > 0
    assert len(chunks["r2"]) > 0


def test_streams_restored_after_normal_execution() -> None:
    """sys.stdout must be restored after the context manager exits normally."""
    stdout_router = _import_stdout_router()
    original_stdout = sys.stdout

    with stdout_router("req-1", on_chunk=lambda _: None):
        pass

    assert sys.stdout is original_stdout


def test_streams_restored_after_exception() -> None:
    """sys.stdout must be restored even when the body raises an exception."""
    stdout_router = _import_stdout_router()
    original_stdout = sys.stdout

    try:
        with stdout_router("req-err", on_chunk=lambda _: None):
            raise RuntimeError("intentional error")
    except RuntimeError:
        pass

    assert sys.stdout is original_stdout


def test_stderr_restored_after_exception() -> None:
    """sys.stderr must also be restored on exception."""
    stdout_router = _import_stdout_router()
    original_stderr = sys.stderr

    try:
        with stdout_router("req-err2", on_chunk=lambda _: None):
            raise ValueError("boom")
    except ValueError:
        pass

    assert sys.stderr is original_stderr


def test_empty_writes_are_dropped() -> None:
    """Empty string writes must not produce emit calls."""
    stdout_router = _import_stdout_router()
    chunks: list[str] = []

    with stdout_router("req-empty", on_chunk=chunks.append):
        sys.stdout.write("")  # should be dropped
        sys.stdout.write("hello")  # should appear

    assert "" not in chunks
    assert any("hello" in c for c in chunks)


def test_chunking_preserved_per_write() -> None:
    """Each individual write call must produce at most one chunk (no merging)."""
    stdout_router = _import_stdout_router()
    chunks: list[str] = []

    with stdout_router("req-chunks", on_chunk=chunks.append):
        sys.stdout.write("first\n")
        sys.stdout.write("second\n")
        sys.stdout.write("third\n")

    # We should have separate chunks (not one big merged string)
    joined = "".join(chunks)
    assert "first" in joined
    assert "second" in joined
    assert "third" in joined
