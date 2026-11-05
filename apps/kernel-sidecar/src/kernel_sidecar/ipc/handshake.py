"""Handshake enforcement (BE-03).

The first message from a new WebSocket client must be a handshake message
containing the CLI token. Token comparison is constant-time.
"""

from __future__ import annotations

import hmac
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

CLOSE_BAD_TOKEN = 4001


async def verify_handshake(websocket: Any, expected_token: str) -> bool:
    """Receive the first message and validate the token.

    Sends close code 4001 on failure. Returns True on success.
    """
    import websockets.exceptions

    from kernel_sidecar.ipc.envelope import Message, MessageType

    try:
        raw = await websocket.recv()
        msg = Message.from_json(raw)
    except (websockets.exceptions.ConnectionClosed, json.JSONDecodeError, KeyError):
        logger.warning("Handshake: failed to parse first message")
        await websocket.close(4001, "Bad token")
        return False

    if msg.type != MessageType.HANDSHAKE:
        logger.warning("Handshake: expected 'handshake', got '%s'", msg.type)
        await websocket.close(CLOSE_BAD_TOKEN, "Bad token")
        return False

    token = msg.payload.get("token", "")
    if not hmac.compare_digest(token, expected_token):
        logger.warning("Handshake: token mismatch")
        await websocket.close(CLOSE_BAD_TOKEN, "Bad token")
        return False

    from kernel_sidecar.ipc.envelope import MessageType

    reply = Message(id="handshake", type=MessageType.KERNEL_STATUS, payload={"state": "idle"})
    await websocket.send(reply.to_json())
    logger.debug("Handshake: accepted")
    return True
