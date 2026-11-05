"""kernel_status and kernel_restart handlers (BE-19)."""

from __future__ import annotations

import logging
from typing import Any

from kernel_sidecar.ipc.envelope import Message, MessageType

logger = logging.getLogger(__name__)


async def handle_kernel_restart(ws: Any, msg: Message, ctx: Any) -> None:
    """Cancel all pending requests, reset the namespace, emit restarting → idle."""
    await ws.send(
        Message(
            id=msg.id,
            type=MessageType.KERNEL_STATUS,
            payload={"state": "restarting"},
        ).to_json()
    )

    # Cancel all pending executions.
    ctx.executor.cancel_all()

    # Reset namespace.
    ctx.namespace.reset()

    await ws.send(
        Message(
            id=msg.id,
            type=MessageType.KERNEL_STATUS,
            payload={"state": "idle"},
        ).to_json()
    )
