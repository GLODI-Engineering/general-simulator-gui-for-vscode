"""BE-23 — End-to-end smoke test.

Spins up the kernel-sidecar in-process, performs the full simulate pipeline
for the canonical step → pid → integrator → scope model, and asserts the
result waveform matches the precomputed reference within rtol=1e-4, atol=1e-6.

This is the backend v1 acceptance gate (progress.backend.yaml BE-23).
"""

from __future__ import annotations

import asyncio
import json
import pathlib
import urllib.request

import numpy as np
import pytest

from tests.backend.e2e._ws_helpers import recv_json

pytestmark = pytest.mark.asyncio

FIXTURES = pathlib.Path(__file__).parent.parent / "fixtures"
MODELS_DIR = FIXTURES / "models"
REF_DIR = FIXTURES / "reference"
GSIM_FILE = MODELS_DIR / "step_pid_integrator_scope.gsim"
REF_FILE = REF_DIR / "step_pid_integrator_scope.npz"


# ---------------------------------------------------------------------------
# Happy-path smoke
# ---------------------------------------------------------------------------


async def test_smoke_e2e(e2e_server: dict, requires_gsim_solve_path: None) -> None:
    """
    Full pipeline:
    1. Connect + handshake.
    2. Send simulate with the canonical fixture model.
    3. Collect simulate_progress + simulate_result.
    4. Fetch manifest over HTTP.
    5. Fetch each signal slice.
    6. Compare against reference within rtol=1e-4, atol=1e-6.
    """
    import websockets

    uri = e2e_server["ws_uri"]
    token = e2e_server["token"]
    http_base = e2e_server["http_base"]

    # Load the .gsim fixture
    if not GSIM_FILE.exists():
        pytest.skip(f"Fixture model not found: {GSIM_FILE}")

    model_doc = json.loads(GSIM_FILE.read_text(encoding="utf-8"))

    async with websockets.connect(uri) as ws:
        # Handshake
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        hs_reply = await recv_json(ws, timeout=5.0)
        assert hs_reply["type"] == "kernel_status"
        assert hs_reply["payload"]["state"] == "idle"

        # Simulate
        await ws.send(
            json.dumps(
                {
                    "id": "smoke-sim",
                    "type": "simulate",
                    "payload": {
                        "model": model_doc,
                        "options": {"t_start": 0.0, "t_end": 10.0, "n_samples": 3000},
                    },
                }
            )
        )

        # Collect messages
        result_msg = None
        progress_count = 0
        deadline = asyncio.get_event_loop().time() + 30.0

        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            assert remaining > 0, "Timed out waiting for simulate_result"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            if msg["type"] == "simulate_progress":
                progress_count += 1
                frac = msg["payload"].get("frac", -1)
                assert 0.0 <= frac <= 1.0, f"Progress frac out of range: {frac}"
            elif msg["type"] == "simulate_result":
                result_msg = msg
                break

    assert result_msg is not None
    payload = result_msg["payload"]
    assert payload["status"] == "ok", f"Simulate failed: {payload}"
    assert progress_count > 0, "No simulate_progress messages received"

    sim_id = payload["sim_id"]
    signals_info = payload["signals"]
    assert len(signals_info) > 0

    # Fetch manifest
    manifest_url = f"{http_base}/results/{sim_id}/manifest.json?token={token}"
    with urllib.request.urlopen(manifest_url, timeout=10) as resp:
        manifest = json.loads(resp.read().decode("utf-8"))
    assert manifest["sim_id"] == sim_id
    assert manifest["status"] == "ok"

    # Fetch each signal slice and compare to reference
    if not REF_FILE.exists():
        pytest.skip(
            f"Reference file not found: {REF_FILE} — generate with scripts/gen_reference.py"
        )

    reference = np.load(str(REF_FILE))

    for sig in manifest["signals"]:
        sig_url = f"{http_base}{sig['url']}?token={token}"
        with urllib.request.urlopen(sig_url, timeout=10) as resp:
            raw_bytes = resp.read()

        import io

        actual = np.load(io.BytesIO(raw_bytes))

        ref_key = sig["name"]
        if ref_key in reference:
            np.testing.assert_allclose(
                actual,
                reference[ref_key],
                rtol=1e-4,
                atol=1e-6,
                err_msg=f"Signal {ref_key!r} differs from reference",
            )


async def test_smoke_completes_under_30s(e2e_server: dict) -> None:
    """The full smoke test must run in under 30 s wall time."""
    import time

    import websockets

    if not GSIM_FILE.exists():
        pytest.skip(f"Fixture model not found: {GSIM_FILE}")

    model_doc = json.loads(GSIM_FILE.read_text(encoding="utf-8"))
    uri = e2e_server["ws_uri"]
    token = e2e_server["token"]

    t0 = time.monotonic()
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        await ws.recv()

        await ws.send(
            json.dumps(
                {
                    "id": "perf-sim",
                    "type": "simulate",
                    "payload": {
                        "model": model_doc,
                        "options": {"t_start": 0.0, "t_end": 10.0, "n_samples": 3000},
                    },
                }
            )
        )

        deadline = asyncio.get_event_loop().time() + 30.0
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            assert remaining > 0, "Smoke test exceeded 30 s wall time"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            if msg["type"] == "simulate_result":
                break

    elapsed = time.monotonic() - t0
    assert elapsed < 30.0, f"Smoke test took {elapsed:.1f}s; must be under 30s"
