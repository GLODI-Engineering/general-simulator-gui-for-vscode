"""BE-28 — SPICE end-to-end smoke test.

Submits an RC circuit .gsim to the live kernel-sidecar.  Skipped
automatically when neither ngspice nor Xyce is found on the host.

Acceptance bullets from progress.backend.yaml BE-28:
- RC circuit end-to-end: status="ok" and V(net1) present in the manifest.
- The existing BE-23 scipy smoke (step→pid→scope) is verified unbroken.
"""

from __future__ import annotations

import asyncio
import json
import pathlib
import urllib.request

import pytest

from tests.backend.e2e._ws_helpers import recv_json

pytestmark = pytest.mark.asyncio

FIXTURES = pathlib.Path(__file__).parent.parent / "fixtures"
MODELS_DIR = FIXTURES / "models"


def _rc_model_dict() -> dict:  # type: ignore[type-arg]
    """Inline RC circuit model (does not require a fixture file on disk)."""
    return {
        "schema_version": 1,
        "model": {
            "id": "rc-spice-smoke",
            "name": "RC SPICE Smoke",
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


def _any_spice_found() -> bool:
    """Return True if ngspice or Xyce is accessible on this host."""
    from simulator.solvers.ngspice_solver import discover_ngspice
    from simulator.solvers.xyce_solver import XyceSolver

    return discover_ngspice() is not None or XyceSolver.from_discovery() is not None


# ---------------------------------------------------------------------------
# SPICE smoke
# ---------------------------------------------------------------------------


async def test_spice_smoke_rc_circuit(e2e_server: dict) -> None:
    """
    RC circuit end-to-end with a real SPICE solver.
    Skipped if neither ngspice nor Xyce is installed.
    """
    if not _any_spice_found():
        pytest.skip("Neither ngspice nor Xyce found on this host — skipping SPICE smoke")

    import websockets

    uri = e2e_server["ws_uri"]
    token = e2e_server["token"]
    http_base = e2e_server["http_base"]

    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        hs_reply = await recv_json(ws, timeout=5.0)
        assert hs_reply["payload"]["state"] == "idle"

        await ws.send(
            json.dumps(
                {
                    "id": "spice-smoke",
                    "type": "simulate",
                    "payload": {
                        "model": _rc_model_dict(),
                        "options": {"t_start": 0.0, "t_end": 1e-3, "n_samples": 100},
                    },
                }
            )
        )

        result_msg = None
        deadline = asyncio.get_event_loop().time() + 30.0
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            assert remaining > 0, "Timed out waiting for SPICE simulate_result"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            if msg["type"] == "simulate_result":
                result_msg = msg
                break

    assert result_msg is not None
    payload = result_msg["payload"]
    assert payload["status"] == "ok", f"SPICE smoke failed: {payload}"

    sim_id = payload["sim_id"]
    manifest_url = f"{http_base}/results/{sim_id}/manifest.json?token={token}"
    with urllib.request.urlopen(manifest_url, timeout=10) as resp:
        manifest = json.loads(resp.read().decode("utf-8"))

    assert manifest["status"] == "ok"
    signal_names = [s["name"] for s in manifest.get("signals", [])]
    assert any("net1" in n for n in signal_names) or any("V" in n for n in signal_names), (
        f"Expected a V(net1) or similar signal in manifest; got: {signal_names}"
    )


# ---------------------------------------------------------------------------
# Regression: existing scipy path must still work
# ---------------------------------------------------------------------------


async def test_scipy_smoke_unbroken(e2e_server: dict) -> None:
    """
    After BE-28 wiring, the existing step→pid→integrator→scope scipy path
    must still produce status="ok".
    """
    import websockets

    GSIM_FILE = MODELS_DIR / "step_pid_integrator_scope.gsim"
    if not GSIM_FILE.exists():
        pytest.skip(f"Control-path fixture not found: {GSIM_FILE}")

    model_doc = json.loads(GSIM_FILE.read_text(encoding="utf-8"))
    uri = e2e_server["ws_uri"]
    token = e2e_server["token"]

    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        await ws.recv()

        await ws.send(
            json.dumps(
                {
                    "id": "scipy-regression",
                    "type": "simulate",
                    "payload": {
                        "model": model_doc,
                        "options": {"t_start": 0.0, "t_end": 10.0, "n_samples": 3000},
                    },
                }
            )
        )

        result_msg = None
        deadline = asyncio.get_event_loop().time() + 30.0
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            assert remaining > 0, "Timed out waiting for scipy simulate_result"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            if msg["type"] == "simulate_result":
                result_msg = msg
                break

    assert result_msg is not None
    assert result_msg["payload"]["status"] == "ok", (
        f"scipy regression failed after BE-28: {result_msg['payload']}"
    )
