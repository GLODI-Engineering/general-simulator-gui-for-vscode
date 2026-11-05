"""BE-28 — xfail circuit test updated for the classic SPICE path.

BE-23 originally asserted that circuit-element models produce status="error"
with a "Phase 2" message. BE-28 changes this contract:

- When ngspice or Xyce is installed: expect status="ok" (real solve).
- When neither simulator is found: expect status="error" with a message that
  mentions "No SPICE simulator" (not "Phase 2").

The "Phase 2" assertion is intentionally removed.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from tests.backend.e2e._ws_helpers import recv_json

pytestmark = pytest.mark.asyncio


def _rc_circuit_model() -> dict:  # type: ignore[type-arg]
    """A minimal .gsim RC circuit using classic-path block types."""
    return {
        "schema_version": 1,
        "model": {
            "id": "rc-circuit-model",
            "name": "RC Circuit",
            "grid": 10,
            "blocks": [
                {
                    "id": "v1",
                    "type": "source.voltage.dc",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"V": 5.0},
                },
                {
                    "id": "r1",
                    "type": "passive.resistor",
                    "position": [100, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"R": 1000.0},
                },
                {
                    "id": "c1",
                    "type": "passive.capacitor",
                    "position": [200, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"C": 1e-6},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "v1", "port": "p"},
                    "to": {"block": "r1", "port": "p"},
                },
                {
                    "id": "w2",
                    "from": {"block": "r1", "port": "n"},
                    "to": {"block": "c1", "port": "p"},
                },
                {
                    "id": "w3",
                    "from": {"block": "c1", "port": "n"},
                    "to": {"block": "v1", "port": "n"},
                },
            ],
            "metadata": {},
        },
    }


async def test_circuit_element_result_is_ok_or_no_simulator(e2e_server: dict) -> None:
    """
    BE-28 contract: a circuit-element model either:
    a) completes successfully (status="ok") when a SPICE simulator is installed, or
    b) fails with "No SPICE simulator found" (status="error") when none is installed.

    The old "Phase 2" error message is no longer acceptable.
    """
    import websockets

    uri = e2e_server["ws_uri"]
    token = e2e_server["token"]

    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        await ws.recv()

        await ws.send(
            json.dumps(
                {
                    "id": "circuit-sim-28",
                    "type": "simulate",
                    "payload": {
                        "model": _rc_circuit_model(),
                        "options": {"t_start": 0.0, "t_end": 1e-3, "n_samples": 100},
                    },
                }
            )
        )

        deadline = asyncio.get_event_loop().time() + 15.0
        result_msg = None
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            assert remaining > 0, "Timed out waiting for simulate_result"
            msg = await recv_json(ws, timeout=min(remaining, 3.0))
            if msg["type"] == "simulate_result":
                result_msg = msg
                break

    assert result_msg is not None
    payload = result_msg["payload"]
    status = payload.get("status")

    if status == "ok":
        # A SPICE simulator was found and the simulation ran.
        assert "sim_id" in payload or "signals" in payload, (
            f"status=ok but no sim_id/signals in payload: {payload}"
        )
    elif status == "error":
        # No SPICE simulator installed — message must say so, not mention Phase 2.
        error_text = json.dumps(payload)
        assert "Phase 2" not in error_text and "phase 2" not in error_text, (
            f"Error must not mention 'Phase 2' after BE-28: {error_text}"
        )
        assert (
            "spice" in error_text.lower()
            or "ngspice" in error_text.lower()
            or "xyce" in error_text.lower()
            or "simulator" in error_text.lower()
        ), f"Error message must mention SPICE/ngspice/Xyce/simulator: {error_text}"
    else:
        pytest.fail(f"Unexpected simulate_result status {status!r}: {payload}")
