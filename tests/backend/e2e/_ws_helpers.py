"""Shared WebSocket message helpers for the e2e test suite.

BE-56 made WAVEFORM_CHUNK a binary frame instead of JSON — every e2e test
that reads simulate messages off a real WebSocket needs to skip binary
frames rather than pass them to json.loads() (which raises UnicodeDecodeError
on binary payload bytes). Centralized here instead of duplicated inline in
~6 test files that each had their own copy of the same read loop.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any


async def recv_json(ws: Any, timeout: float) -> dict[str, Any]:
    """Read WebSocket messages until the next JSON (text) one, and return it.

    Silently skips any binary frame (e.g. a live/streamed WAVEFORM_CHUNK
    frame, BE-56) — tests that need the streamed waveform data itself
    should use kernel_sidecar.ipc.envelope.decode_waveform_chunk_frame
    directly rather than this helper. *timeout* applies to each individual
    ws.recv() call, matching the existing per-call timeout callers already
    used with asyncio.wait_for before this helper existed.
    """
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        if isinstance(raw, bytes):
            continue
        result: dict[str, Any] = json.loads(raw)
        return result
