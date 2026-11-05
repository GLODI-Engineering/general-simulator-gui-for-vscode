"""Message dispatcher: routes incoming messages to the correct handler.

Unknown message types receive an execute_error reply and the loop continues.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Any

from kernel_sidecar.ipc.envelope import Message, MessageType

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Handler signature: async (ws, msg, context) -> None
HandlerFn = Callable[..., Coroutine[Any, Any, None]]


class Dispatcher:
    def __init__(self) -> None:
        self._handlers: dict[str, HandlerFn] = {}

    def register(self, msg_type: str, fn: HandlerFn) -> None:
        self._handlers[msg_type] = fn

    async def dispatch(self, ws: Any, msg: Message, context: Any) -> None:
        handler = self._handlers.get(msg.type)
        if handler is None:
            logger.warning("Unknown message type: %s", msg.type)
            err = Message(
                id=msg.id,
                type=MessageType.EXECUTE_ERROR,
                payload={
                    "exc_type": "UnknownMessageType",
                    "message": f"Unknown message type: {msg.type!r}",
                    "traceback": "",
                },
            )
            await ws.send(err.to_json())
            return
        try:
            await handler(ws, msg, context)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Unhandled exception in handler for %s", msg.type)
            err = Message(
                id=msg.id,
                type=MessageType.EXECUTE_ERROR,
                payload={
                    "exc_type": "InternalError",
                    "message": "Internal server error — see kernel logs.",
                    "traceback": "",
                },
            )
            await ws.send(err.to_json())
