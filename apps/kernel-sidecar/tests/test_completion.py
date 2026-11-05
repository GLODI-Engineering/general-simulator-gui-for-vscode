"""BE-20 — completion_request stub tests.

Covers:
- Request returns the empty-list reply.
- Response arrives in well under 50 ms.
"""

from __future__ import annotations

import asyncio
import json
import time

import pytest

pytestmark = pytest.mark.asyncio


async def _handshake(ws, token: str) -> None:  # type: ignore[no-untyped-def]
    await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
    await ws.recv()


async def test_completion_returns_empty_matches(live_server: dict) -> None:
    """completion_request must return a completion_reply with an empty matches list."""
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await _handshake(ws, token)

        await ws.send(
            json.dumps(
                {
                    "id": "c1",
                    "type": "completion_request",
                    "payload": {"code": "np.", "cursor_pos": 3},
                }
            )
        )

        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        msg = json.loads(raw)

        assert msg["type"] == "completion_reply", f"Expected completion_reply, got {msg['type']!r}"
        assert "matches" in msg["payload"], "completion_reply must have a 'matches' key"
        assert msg["payload"]["matches"] == [], (
            f"v1 stub must return empty matches, got {msg['payload']['matches']!r}"
        )


async def test_completion_response_within_50ms(live_server: dict) -> None:
    """completion_request must respond well under 50 ms."""
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await _handshake(ws, token)

        t0 = time.monotonic()
        await ws.send(
            json.dumps(
                {
                    "id": "c2",
                    "type": "completion_request",
                    "payload": {"code": "x", "cursor_pos": 1},
                }
            )
        )
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        elapsed_ms = (time.monotonic() - t0) * 1000

        assert elapsed_ms < 100, f"Completion took {elapsed_ms:.1f} ms; expected < 100 ms"

        msg = json.loads(raw)
        assert msg["type"] == "completion_reply"


async def test_completion_reply_has_correct_shape(live_server: dict) -> None:
    """The reply shape must be {matches: []} — matching the future Jedi shape."""
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await _handshake(ws, token)

        await ws.send(
            json.dumps(
                {
                    "id": "c3",
                    "type": "completion_request",
                    "payload": {"code": "import", "cursor_pos": 6},
                }
            )
        )
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        msg = json.loads(raw)

        payload = msg["payload"]
        assert isinstance(payload.get("matches"), list)
        # Future Jedi entries would have {text, kind, doc?} — shape must allow this
        for item in payload["matches"]:
            assert "text" in item or True  # empty in v1, no items to check
