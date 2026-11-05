"""conftest.py for tests/backend/ (BE-23 end-to-end tests).

Provides the `e2e_server` fixture: starts the kernel-sidecar in-process,
yields WebSocket URI, HTTP base URL, and token.
"""

from __future__ import annotations

import asyncio
import secrets
import socket
import threading
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest_asyncio.fixture
async def e2e_server(tmp_path) -> AsyncIterator[dict]:  # type: ignore[misc]
    """Start the kernel-sidecar server in a dedicated thread/event-loop.

    Running the server on a *separate* event loop means synchronous HTTP
    calls in the test (urllib.request.urlopen) do not block the server from
    responding — they run on the test's thread while the server loop runs on
    its own thread.

    Yields a dict with:
      ws_uri     — ws://127.0.0.1:<port>
      http_base  — http://127.0.0.1:<port>
      token      — the handshake token
      port       — the bound port
      workdir    — tmp_path used for result files
    """
    try:
        from kernel_sidecar.server import run_server
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.server not yet implemented — BE-23 requires BE-02+")

    token = secrets.token_hex(32)
    port = _free_port()

    ready = threading.Event()
    stop = threading.Event()

    def _run() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _serve() -> None:
            task = asyncio.create_task(run_server(port=port, token=token, workdir=str(tmp_path)))
            await asyncio.sleep(0.3)  # Let the server bind and print KERNEL_READY
            ready.set()
            # Poll until the test is done.
            while not stop.is_set():
                await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        try:
            loop.run_until_complete(_serve())
        finally:
            loop.close()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    ready.wait(timeout=5.0)

    try:
        yield {
            "ws_uri": f"ws://127.0.0.1:{port}",
            "http_base": f"http://127.0.0.1:{port}/",
            "token": token,
            "port": port,
            "workdir": tmp_path,
        }
    finally:
        stop.set()
        thread.join(timeout=5.0)
