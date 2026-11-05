"""WebSocket server — main event loop (BE-02, BE-03).

Binds to 127.0.0.1 only. Accepts one connection at a time.
Prints KERNEL_READY port=<n> token=<hex> to stdout after binding.
"""

from __future__ import annotations

import asyncio
import logging
import os
import pathlib
from typing import Any

logger = logging.getLogger(__name__)

# Ruff guard: 0.0.0.0 must never appear in this file's bind call.
# (The ruff rule catches it at lint time; this comment documents the intent.)
_BIND_HOST = "127.0.0.1"


class _KernelContext:
    """Shared state passed to every IPC handler."""

    def __init__(self, token: str, workdir: str) -> None:
        from kernel_sidecar.kernel.executor import Executor
        from kernel_sidecar.kernel.namespace import Namespace

        self.token = token
        self.workdir = workdir
        self.namespace = Namespace()
        self.executor = Executor(max_workers=4)
        # Active simulate cancel tokens keyed by request id.
        self.simulate_tokens: dict[str, Any] = {}
        self.simulate_tasks: dict[str, Any] = {}
        # Simulation health tracking.
        self.sim_progress: float = 0.0
        self.sim_message: str = ""
        self.sim_started_at: float | None = None


def _build_dispatcher(ctx: _KernelContext) -> Any:
    from kernel_sidecar.ipc.dispatch import Dispatcher
    from kernel_sidecar.ipc.envelope import MessageType
    from kernel_sidecar.ipc.handlers.completion import handle_completion_request
    from kernel_sidecar.ipc.handlers.execute import handle_execute, handle_execute_cancel
    from kernel_sidecar.ipc.handlers.kernel import handle_kernel_restart
    from kernel_sidecar.ipc.handlers.simulate import handle_simulate, handle_simulate_cancel
    from kernel_sidecar.ipc.handlers.workspace import handle_workspace_get

    d = Dispatcher()
    d.register(MessageType.EXECUTE, handle_execute)
    d.register(MessageType.EXECUTE_CANCEL, handle_execute_cancel)
    d.register(MessageType.WORKSPACE_GET, handle_workspace_get)
    d.register(MessageType.KERNEL_RESTART, handle_kernel_restart)
    d.register(MessageType.COMPLETION_REQUEST, handle_completion_request)
    d.register(MessageType.SIMULATE, handle_simulate)
    d.register(MessageType.SIMULATE_CANCEL, handle_simulate_cancel)
    return d


async def _connection_handler(
    websocket: Any,
    ctx: _KernelContext,
    dispatcher: Any,
    connected: list[bool],
) -> None:
    import websockets.exceptions

    from kernel_sidecar.ipc.envelope import Message

    # Single-connection rule: reject second client.
    if connected[0]:
        logger.warning("Rejecting second WebSocket connection (single-connection kernel).")
        await websocket.close(4000, "Single-connection kernel")
        return

    connected[0] = True
    try:
        # Handshake.
        from kernel_sidecar.ipc.handshake import verify_handshake

        logger.info("Client connected, verifying handshake…")
        ok = await verify_handshake(websocket, ctx.token)
        if not ok:
            logger.warning("Handshake failed — disconnecting client.")
            return
        logger.info("Handshake OK — entering message loop.")

        # Message loop.
        async for raw in websocket:
            if isinstance(raw, bytes):
                logger.debug("Received binary frame (unexpected in text loop)")
                continue
            try:
                msg = Message.from_json(raw)
            except Exception:
                logger.warning("Failed to parse message: %r", raw[:200])
                continue
            logger.debug("RX: type=%s id=%s", msg.type, msg.id)
            await dispatcher.dispatch(websocket, msg, ctx)

    except websockets.exceptions.ConnectionClosed as exc:
        logger.info("Connection closed: %s", exc)
    except Exception:
        logger.exception("Unexpected error in connection handler")
    finally:
        connected[0] = False


async def run_server(
    port: int = 0,
    token: str = "",
    workdir: str | None = None,
    connect_timeout: float = 0.0,
) -> None:
    """Start the WebSocket server and block until the process is killed.

    Args:
        connect_timeout: If > 0, exit cleanly if no client connects within
            this many seconds after the server starts listening.
    """
    from websockets.asyncio.server import serve as _ws_serve

    if workdir is None:
        xdg = os.environ.get("XDG_DATA_HOME")
        if xdg:
            workdir = str(pathlib.Path(xdg) / "general-simulator" / "sidecar-workdir")
        else:
            workdir = str(
                pathlib.Path.home() / ".local" / "share" / "general-simulator" / "sidecar-workdir"
            )

    ctx = _KernelContext(token=token, workdir=workdir)
    dispatcher = _build_dispatcher(ctx)
    connected: list[bool] = [False]
    results_root = pathlib.Path(workdir) / "results"

    from kernel_sidecar.waveform.slice_server import handle_http

    async def process_request(connection: Any, request: Any) -> Any:
        """Intercept plain HTTP requests for waveform slice serving."""
        try:
            path = request.path
            headers = request.headers
        except AttributeError:
            # Legacy websockets API.
            path = connection
            headers = request
        result = await handle_http(path, headers, results_root, token, ctx)
        if result is None:
            return None  # Fall through to WebSocket upgrade.
        status, resp_headers, body = result
        # Build an HTTP response using the websockets Response type.
        import http

        from websockets.asyncio.server import (
            Response,
        )
        from websockets.http11 import Headers

        http_status = http.HTTPStatus(status)
        # Add Connection: close so urllib.request / httpx don't keep the socket open.
        resp_headers = [*list(resp_headers), ("Connection", "close")]
        rh = Headers(resp_headers)
        return Response(http_status, http_status.phrase, rh, body)

    async def handler(ws: Any) -> None:
        await _connection_handler(ws, ctx, dispatcher, connected)

    async with _ws_serve(handler, _BIND_HOST, port, process_request=process_request) as server:
        bound_port = server.sockets[0].getsockname()[1]
        # Print the KERNEL_READY signal for Tauri to parse.
        print(f"KERNEL_READY port={bound_port} token={token}", flush=True)
        logger.info("Kernel listening on %s:%d", _BIND_HOST, bound_port)

        if connect_timeout > 0:
            # Exit if no client connects within the timeout window.
            await asyncio.sleep(connect_timeout)
            if not connected[0]:
                logger.info("No client connected within %.1fs; exiting.", connect_timeout)
                return
            # Client connected — run until disconnected.
            while connected[0]:
                await asyncio.sleep(0.1)
        else:
            await asyncio.Future()  # Run forever.
