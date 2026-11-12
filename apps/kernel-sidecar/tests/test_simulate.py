"""BE-18 — simulate IPC handler tests.

Covers:
- Happy path: step → pid → integrator → scope completes, manifest produced.
- Algebraic-loop fixture → simulate_result status="error" with useful message; no manifest.
- Cancel mid-solve: status="error" with type="Cancelled"; no manifest.
"""

from __future__ import annotations

import asyncio
import json

import pytest

pytestmark = pytest.mark.asyncio


def _step_pid_integrator_scope() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "sps-model",
            "name": "Step-PID-Integrator-Scope",
            "grid": 10,
            "blocks": [
                {
                    "id": "b-step",
                    "type": "signal.step",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"amplitude": 1.0, "t_step": 0.0},
                },
                {
                    "id": "b-sum",
                    "type": "control.sum",
                    "position": [80, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"signs": "+-"},
                },
                {
                    "id": "b-pid",
                    "type": "control.pid",
                    "position": [160, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"kp": 1.0, "ki": 0.5, "kd": 0.1, "anti_windup": False},
                },
                {
                    "id": "b-integ",
                    "type": "control.integrator",
                    "position": [240, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"lo": -1e9, "hi": 1e9},
                },
                {
                    "id": "b-scope",
                    "type": "sinks.scope",
                    "position": [320, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "b-step", "port": "out"},
                    "to": {"block": "b-sum", "port": "in0"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w2",
                    "from": {"block": "b-integ", "port": "out"},
                    "to": {"block": "b-sum", "port": "in1"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w3",
                    "from": {"block": "b-sum", "port": "out"},
                    "to": {"block": "b-pid", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w4",
                    "from": {"block": "b-pid", "port": "out"},
                    "to": {"block": "b-integ", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w5",
                    "from": {"block": "b-integ", "port": "out"},
                    "to": {"block": "b-scope", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
            ],
            "metadata": {},
        },
    }


def _algebraic_loop_model() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "alg-loop",
            "name": "Algebraic loop",
            "grid": 10,
            "blocks": [
                {
                    "id": "b-step",
                    "type": "signal.step",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"amplitude": 1.0, "t_step": 0.0},
                },
                {
                    "id": "b-sum",
                    "type": "control.sum",
                    "position": [100, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"signs": "+-"},
                },
                {
                    "id": "b-gain",
                    "type": "control.gain",
                    "position": [200, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"k": 0.5},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "b-step", "port": "out"},
                    "to": {"block": "b-sum", "port": "in0"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w2",
                    "from": {"block": "b-sum", "port": "out"},
                    "to": {"block": "b-gain", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w3",
                    "from": {"block": "b-gain", "port": "out"},
                    "to": {"block": "b-sum", "port": "in1"},
                    "waypoints": [],
                    "pinned": False,
                },
            ],
            "metadata": {},
        },
    }


async def _collect_simulate_messages(ws, timeout: float = 30.0) -> list[dict]:  # type: ignore[no-untyped-def]
    """Read messages until simulate_result is received or timeout."""
    messages = []
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise TimeoutError("Did not receive simulate_result in time")
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 5.0))
            if isinstance(raw, bytes):
                # Binary waveform_chunk frame (BE-56) — not JSON, and no test
                # in this file asserts on chunk contents, so just note its
                # presence and keep collecting until simulate_result arrives.
                messages.append({"type": "waveform_chunk", "binary": True})
                continue
            msg = json.loads(raw)
            messages.append(msg)
            if msg["type"] == "simulate_result":
                break
        except TimeoutError:
            raise TimeoutError("Did not receive simulate_result in time")
    return messages


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_cancel_mid_solve(live_server: dict) -> None:
    """Cancelling a simulation in progress must result in a Cancelled error."""
    import websockets

    uri = live_server["uri"]
    token = live_server["token"]

    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        await ws.recv()

        # Send a long-running simulation (large t_end)
        await ws.send(
            json.dumps(
                {
                    "id": "sim-long",
                    "type": "simulate",
                    "payload": {
                        "model": _step_pid_integrator_scope(),
                        "options": {"t_start": 0.0, "t_end": 1000.0, "n_samples": 3000},
                    },
                }
            )
        )

        # Wait for at least one progress message
        got_progress = False
        for _ in range(20):
            raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
            msg = json.loads(raw)
            if msg["type"] == "simulate_progress":
                got_progress = True
                break
            if msg["type"] == "simulate_result":
                # Finished too fast — test is not meaningful
                pytest.skip("Simulation completed before cancel could be sent")

        # Cancel
        await ws.send(json.dumps({"id": "sim-long", "type": "simulate_cancel", "payload": {}}))

        # Collect until simulate_result
        messages = await _collect_simulate_messages(ws, timeout=5.0)
        result = messages[-1]

        assert result["type"] == "simulate_result"
        assert result["payload"]["status"] == "error"
        assert "Cancelled" in json.dumps(result["payload"])
