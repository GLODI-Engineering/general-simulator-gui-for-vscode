"""workspace_get handler (BE-09): returns a variable's value as binary frame or JSON."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from kernel_sidecar.ipc.binary_frame import encode_binary_frame
from kernel_sidecar.ipc.envelope import Message, MessageType

logger = logging.getLogger(__name__)


def encode_workspace_value(name: str, value: Any) -> str | bytes:
    """Encode a workspace value for transmission.

    Arrays are encoded as binary frames (bytes); all other values as JSON (str).
    """
    if isinstance(value, np.ndarray):
        return encode_binary_frame("workspace_get", value)
    return Message(
        id="workspace_get",
        type=MessageType.WORKSPACE_VALUE,
        payload={"name": name, "value": repr(value)},
    ).to_json()


async def handle_workspace_get(ws: Any, msg: Message, ctx: Any) -> None:
    name: str = msg.payload.get("name", "")
    with ctx.namespace.lock:
        g = ctx.namespace.get_globals()
        if name not in g:
            await ws.send(
                Message(
                    id=msg.id,
                    type=MessageType.EXECUTE_ERROR,
                    payload={
                        "exc_type": "NameError",
                        "message": f"Name {name!r} not found in workspace.",
                        "traceback": "",
                    },
                ).to_json()
            )
            return
        value = g[name]

    if isinstance(value, np.ndarray):
        frame = encode_binary_frame(msg.id, value)
        await ws.send(frame)
    else:
        await ws.send(
            Message(
                id=msg.id,
                type=MessageType.WORKSPACE_VALUE,
                payload={"name": name, "value": repr(value)},
            ).to_json()
        )
