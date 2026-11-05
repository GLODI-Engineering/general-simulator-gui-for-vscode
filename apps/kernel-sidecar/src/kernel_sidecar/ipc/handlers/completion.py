"""completion_request stub (BE-20).

Returns an empty matches list in v1. Protocol is wired for future Jedi-backed
completion without IPC contract churn.
"""

from __future__ import annotations

from typing import Any

from kernel_sidecar.ipc.envelope import Message, MessageType


async def handle_completion_request(ws: Any, msg: Message, ctx: Any) -> None:
    await ws.send(
        Message(
            id=msg.id,
            type=MessageType.COMPLETION_REPLY,
            payload={"matches": []},
        ).to_json()
    )
