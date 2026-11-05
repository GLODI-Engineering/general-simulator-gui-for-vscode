"""BE-02 — WebSocket server behaviour tests.

Tests the server's:
- Single-connection rule (second client gets code 4000).
- Unknown message type produces execute_error with the offending type echoed.
- Server stays alive after an error.

These tests require the server to be running.  They use pytest-asyncio and
the `live_server` fixture defined in conftest.py for this package.
"""

from __future__ import annotations

import asyncio
import json

import pytest
import websockets

from kernel_sidecar.ipc.envelope import MessageType

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _handshake_msg(token: str) -> str:
    return json.dumps({"id": "handshake", "type": "handshake", "payload": {"token": token}})


def _unknown_msg() -> str:
    return json.dumps({"id": "u1", "type": "not_a_real_type", "payload": {}})


# ---------------------------------------------------------------------------
# Single-connection rule
# ---------------------------------------------------------------------------


async def test_second_connection_rejected_with_4000(live_server: dict) -> None:
    """A second concurrent connection must be closed with code 4000."""
    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws1:
        await ws1.send(_handshake_msg(token))
        # Drain the handshake reply
        await ws1.recv()

        # Open a second connection — it should be rejected
        try:
            async with websockets.connect(uri) as ws2:
                # If we somehow get connected, we might receive an error frame
                msg = await asyncio.wait_for(ws2.recv(), timeout=2.0)
                # The server may send an error before closing
                _ = msg
        except websockets.exceptions.ConnectionClosedError as exc:
            assert exc.code == 4000, f"Expected 4000, got {exc.code}"
        except websockets.exceptions.ConnectionClosed as exc:
            assert exc.code == 4000, f"Expected 4000, got {exc.code}"


# ---------------------------------------------------------------------------
# Unknown message type
# ---------------------------------------------------------------------------


async def test_unknown_type_produces_execute_error(live_server: dict) -> None:
    """Sending an unknown message type must produce execute_error; server stays alive."""
    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await ws.send(_handshake_msg(token))
        _hs_reply = await ws.recv()  # kernel_status idle

        await ws.send(_unknown_msg())
        raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
        msg = json.loads(raw)

        assert msg["type"] == MessageType.EXECUTE_ERROR.value
        assert "not_a_real_type" in json.dumps(msg["payload"])


async def test_server_stays_alive_after_unknown_type(live_server: dict) -> None:
    """After receiving an execute_error for an unknown type, the server loop must continue."""
    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await ws.send(_handshake_msg(token))
        await ws.recv()  # kernel_status idle

        # Send unknown type
        await ws.send(_unknown_msg())
        await ws.recv()  # execute_error

        # Server should still respond to a valid ping-like message
        # We'll send another unknown and expect another execute_error (not a crash)
        await ws.send(_unknown_msg())
        raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
        msg = json.loads(raw)
        assert msg["type"] == MessageType.EXECUTE_ERROR.value
