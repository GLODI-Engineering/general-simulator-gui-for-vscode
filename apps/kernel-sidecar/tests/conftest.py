"""BE-02/BE-03 — conftest.py for the kernel-sidecar test suite.

Provides the `live_server` fixture that starts the WebSocket server in-process
(using an asyncio background task) and yields connection details.

The fixture marks itself as xfail when server.py does not yet exist (stub phase).
"""

from __future__ import annotations

import asyncio
import secrets
import socket
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest_asyncio.fixture
async def live_server() -> AsyncIterator[dict]:  # type: ignore[misc]
    """Spin up the kernel-sidecar server in a background task.

    Yields a dict with ``uri`` and ``token``.

    If server.py is not yet implemented the fixture xfails automatically.
    """
    try:
        from kernel_sidecar.server import run_server
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.server not yet implemented")

    token = secrets.token_hex(32)
    port = _free_port()

    task = asyncio.create_task(
        run_server(port=port, token=token, workdir=None, connect_timeout=0.0)
    )
    # Give the server a moment to bind
    await asyncio.sleep(0.15)

    try:
        yield {"uri": f"ws://127.0.0.1:{port}", "token": token, "port": port}
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
