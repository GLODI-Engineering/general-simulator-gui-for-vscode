"""Execute handler (BE-05): handles execute and execute_cancel messages."""

from __future__ import annotations

import logging
from typing import Any

from kernel_sidecar.ipc.envelope import Message, MessageType
from kernel_sidecar.kernel.matplotlib_hook import begin_capture, collect_figures
from kernel_sidecar.kernel.snapshot import build_snapshot

logger = logging.getLogger(__name__)


async def handle_execute(ws: Any, msg: Message, ctx: Any) -> None:
    """Handle an execute message: compile + run code, stream output."""
    code: str = msg.payload.get("code", "")
    request_id = msg.id

    # Emit busy
    await ws.send(
        Message(
            id=request_id,
            type=MessageType.KERNEL_STATUS,
            payload={"state": "busy"},
        ).to_json()
    )

    async def stream_cb(req_id: str, stream_name: str, chunk: str) -> None:
        await ws.send(
            Message(
                id=req_id,
                type=MessageType.EXECUTE_STREAM,
                payload={"stream": stream_name, "chunk": chunk},
            ).to_json()
        )

    begin_capture()
    result = await ctx.executor.execute(code, request_id, ctx.namespace, stream_cb)

    plots = collect_figures()
    plot_payloads: list[dict] = [{"format": "png", "data": d} for d in plots]

    if result.status != "ok":
        await ws.send(
            Message(
                id=request_id,
                type=MessageType.EXECUTE_ERROR,
                payload={
                    "exc_type": result.exc_type or "Error",
                    "message": result.message or "",
                    "traceback": result.traceback or "",
                },
            ).to_json()
        )
    else:
        with ctx.namespace.lock:
            snapshot = build_snapshot(ctx.namespace.get_globals())

        await ws.send(
            Message(
                id=request_id,
                type=MessageType.WORKSPACE_UPDATE,
                payload=snapshot,
            ).to_json()
        )

        for plot in plot_payloads:
            await ws.send(
                Message(
                    id=request_id,
                    type=MessageType.PLOT_READY,
                    payload=plot,
                ).to_json()
            )

        # Emit idle before execute_result so status listeners see the full cycle.
        await ws.send(
            Message(
                id=request_id,
                type=MessageType.KERNEL_STATUS,
                payload={"state": "idle"},
            ).to_json()
        )

        await ws.send(
            Message(
                id=request_id,
                type=MessageType.EXECUTE_RESULT,
                payload={
                    "status": "ok",
                    "value": result.value if result.value is not None else None,
                    "plots": [p["data"] for p in plot_payloads],
                    "workspace_snapshot": snapshot,
                },
            ).to_json()
        )
        return

    # Emit idle after error path.
    await ws.send(
        Message(
            id=request_id,
            type=MessageType.KERNEL_STATUS,
            payload={"state": "idle"},
        ).to_json()
    )


async def handle_execute_cancel(ws: Any, msg: Message, ctx: Any) -> None:
    """Handle an execute_cancel message."""
    target_id = msg.payload.get("target_id", msg.id)
    ctx.executor.cancel(target_id)
