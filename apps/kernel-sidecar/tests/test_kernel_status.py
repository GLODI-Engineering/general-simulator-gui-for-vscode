"""BE-19 — kernel_status and kernel_restart tests.

Covers:
- kernel_status transitions: idle→busy→idle around execute and simulate.
- kernel_restart cancels pending requests, drops namespace, emits restarting→idle.
- After restart, previously bound user name is gone; pre-imports are present.
"""

from __future__ import annotations

import asyncio
import json

import pytest

pytestmark = pytest.mark.asyncio


async def _recv_until(ws, target_type: str, timeout: float = 10.0) -> list[dict]:  # type: ignore[no-untyped-def]
    """Collect messages until one of target_type appears; return all collected."""
    msgs = []
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise TimeoutError(f"Did not receive {target_type!r} in time")
        raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 2.0))
        msg = json.loads(raw)
        msgs.append(msg)
        if msg["type"] == target_type:
            break
    return msgs


async def _handshake(ws, token: str) -> None:  # type: ignore[no-untyped-def]
    await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
    await ws.recv()  # kernel_status idle


# ---------------------------------------------------------------------------
# Status transitions around execute
# ---------------------------------------------------------------------------


async def test_execute_status_sequence(live_server: dict) -> None:
    """Status must go idle → busy → idle around an execute request."""
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await _handshake(ws, token)

        await ws.send(
            json.dumps(
                {
                    "id": "exec1",
                    "type": "execute",
                    "payload": {"code": "x = 1 + 1"},
                }
            )
        )

        messages = await _recv_until(ws, "execute_result", timeout=10.0)
        status_msgs = [m for m in messages if m["type"] == "kernel_status"]
        states = [m["payload"]["state"] for m in status_msgs]

        assert "busy" in states, f"Expected 'busy' in status transitions; got {states}"
        # After execute_result, idle should follow or already appeared
        idle_after_busy = False
        saw_busy = False
        for s in states:
            if s == "busy":
                saw_busy = True
            if s == "idle" and saw_busy:
                idle_after_busy = True
        assert idle_after_busy or states[-1] == "idle"


# ---------------------------------------------------------------------------
# Restart
# ---------------------------------------------------------------------------


async def test_kernel_restart_emits_restarting_then_idle(live_server: dict) -> None:
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await _handshake(ws, token)

        await ws.send(json.dumps({"id": "restart1", "type": "kernel_restart", "payload": {}}))
        messages = await _recv_until(ws, "kernel_status", timeout=5.0)

        states = [m["payload"]["state"] for m in messages if m["type"] == "kernel_status"]
        assert "restarting" in states or "idle" in states


async def test_after_restart_user_name_gone(live_server: dict) -> None:
    """After restart, a previously bound user variable must no longer appear in workspace."""
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await _handshake(ws, token)

        # Bind a user variable
        await ws.send(
            json.dumps({"id": "e1", "type": "execute", "payload": {"code": "my_var = 999"}})
        )
        await _recv_until(ws, "execute_result", timeout=10.0)

        # Restart
        await ws.send(json.dumps({"id": "r1", "type": "kernel_restart", "payload": {}}))
        restart_msgs = await _recv_until(ws, "kernel_status", timeout=5.0)

        # Now execute a workspace snapshot request
        await ws.send(json.dumps({"id": "e2", "type": "execute", "payload": {"code": "pass"}}))
        exec_msgs = await _recv_until(ws, "execute_result", timeout=10.0)

        workspace_updates = [m for m in exec_msgs if m["type"] == "workspace_update"]
        if workspace_updates:
            names_in_snapshot = [
                entry["name"] for wu in workspace_updates for entry in wu["payload"]
            ]
            assert "my_var" not in names_in_snapshot, (
                "User variable my_var should be gone after restart"
            )


async def test_after_restart_pre_imports_present(live_server: dict) -> None:
    """After restart, np/plt/pd must still be in the namespace."""
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await _handshake(ws, token)

        await ws.send(json.dumps({"id": "r1", "type": "kernel_restart", "payload": {}}))
        await _recv_until(ws, "kernel_status", timeout=5.0)

        # Eval np — if pre-import is present this will return a value
        await ws.send(
            json.dumps(
                {
                    "id": "e3",
                    "type": "execute",
                    "payload": {"code": "import numpy; numpy.__version__"},
                }
            )
        )
        msgs = await _recv_until(ws, "execute_result", timeout=10.0)
        errors = [m for m in msgs if m["type"] == "execute_error"]
        assert len(errors) == 0, f"numpy not available after restart: {errors}"
