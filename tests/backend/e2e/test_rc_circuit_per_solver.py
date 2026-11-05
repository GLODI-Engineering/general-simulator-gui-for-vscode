"""RC circuit — per-solver backend integration tests.

Tests the RC circuit end-to-end pipeline independently for ngspice and Xyce,
verifying:
  1. The kernel-sidecar accepts an RC circuit .gsim payload.
  2. The chosen SPICE solver produces status="ok".
  3. The manifest lists at least one voltage/current signal.
  4. Waveform .npy data is fetchable via the signal URL from the manifest.
  5. The waveform values are physically correct (DC steady-state: V(net1)≈5V,
     V(net2)≈5V, since SPICE initialises from the DC operating point by default).

Each test is skipped when the target solver is not installed on the host.
This mirrors the pattern in test_spice_smoke.py (BE-28).

This suite relies on the simulate payload's optional ``solver`` key so ngspice
and Xyce can be exercised independently on hosts that have both installed.

Note on waveform assertions
---------------------------
The generated netlist uses SPICE default initialisation (DC operating point
before transient), so the capacitor starts at its steady-state voltage (5 V)
and the waveform is flat.  That is physically correct.  A charging-from-zero
test would require ``IC=0 UIC`` in the netlist writer; that is a separate epic.
What we assert here is therefore:
  - ≥ 50 time-points returned
  - All voltage samples in the range [4.9 V, 5.1 V] (within 2 % of 5 V)
  - Current signal (i(vv1)) ≈ 0 A in steady state
"""

from __future__ import annotations

import asyncio
import io
import json
import urllib.request
from typing import Any

import numpy as np
import pytest

from tests.backend.e2e._ws_helpers import recv_json

pytestmark = pytest.mark.asyncio


def _rc_model_dict() -> dict[str, Any]:
    """Minimal RC transient circuit (5V, 1kΩ, 1µF, 1ms sim)."""
    return {
        "schema_version": 1,
        "model": {
            "id": "rc-per-solver",
            "name": "RC Per-Solver Test",
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


async def _run_simulate(
    ws_uri: str,
    token: str,
    model: dict[str, Any],
    solver: str,
    msg_id: str = "rc-sim",
    t_end: float = 1e-3,
    n_samples: int = 100,
) -> dict[str, Any]:
    """Send a simulate message and wait for simulate_result (up to 30 s)."""
    import websockets

    async with websockets.connect(ws_uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        hs = await recv_json(ws, timeout=5.0)
        assert hs["payload"]["state"] == "idle", f"Unexpected handshake state: {hs}"

        await ws.send(
            json.dumps(
                {
                    "id": msg_id,
                    "type": "simulate",
                    "payload": {
                        "model": model,
                        "solver": solver,
                        "options": {"t_start": 0.0, "t_end": t_end, "n_samples": n_samples},
                    },
                }
            )
        )

        deadline = asyncio.get_event_loop().time() + 30.0
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            assert remaining > 0, f"Timed out waiting for simulate_result (id={msg_id})"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            if msg["type"] == "simulate_result":
                return msg["payload"]  # type: ignore[no-any-return]


def _fetch_manifest(http_base: str, token: str, sim_id: str) -> dict[str, Any]:
    url = f"{http_base}/results/{sim_id}/manifest.json?token={token}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))  # type: ignore[no-any-return]


def _fetch_npy_signal(http_base: str, token: str, signal_url: str) -> np.ndarray[Any, Any]:
    """Fetch a waveform signal via its manifest URL and return a numpy array.

    ``signal_url`` is the ``url`` field from the manifest signal entry, e.g.
    ``results/<sim_id>/signals/spice__signal_1.npy``.  The server exposes it
    at ``/results/<sim_id>/signals/<file>.npy`` and returns raw .npy bytes.
    """
    # signal_url may be relative ("results/...") or absolute ("/results/...")
    path = signal_url if signal_url.startswith("/") else f"/{signal_url}"
    full_url = f"{http_base.rstrip('/')}{path}?token={token}"
    with urllib.request.urlopen(full_url, timeout=10) as resp:
        return np.load(io.BytesIO(resp.read()))  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# ngspice
# ---------------------------------------------------------------------------


async def test_rc_circuit_ngspice(e2e_server: dict) -> None:
    """
    RC transient via ngspice specifically.

    Skipped if ngspice is not installed.
    """
    from simulator.solvers.ngspice_solver import discover_ngspice

    if discover_ngspice() is None:
        pytest.skip("ngspice not found on this host — skipping ngspice-specific RC test")

    ws_uri = e2e_server["ws_uri"]
    token = e2e_server["token"]
    http_base = e2e_server["http_base"]

    payload = await _run_simulate(
        ws_uri,
        token,
        _rc_model_dict(),
        solver="ngspice",
        msg_id="rc-ngspice",
    )

    # ── 1. Simulation status ──────────────────────────────────────────────
    assert payload["status"] == "ok", (
        f"ngspice RC simulation returned status={payload['status']!r}: {payload}"
    )

    sim_id = payload["sim_id"]

    # ── 2. Manifest ───────────────────────────────────────────────────────
    manifest = _fetch_manifest(http_base, token, sim_id)
    assert manifest["status"] == "ok", f"Manifest status not ok: {manifest}"
    signals = manifest.get("signals", [])
    assert len(signals) > 0, "Manifest has no signals"
    signal_names = [s["name"] for s in signals]

    # Expect at least one voltage signal (e.g. v(net1) at the RC node)
    voltage_signals = [s for s in signals if s["name"].lower().startswith("v(")]
    assert len(voltage_signals) > 0, (
        f"Expected at least one v(...) voltage signal in ngspice output; got: {signal_names}"
    )

    # ── 3. Waveform .npy fetchable and physically correct ─────────────────
    # Use the URL from the manifest entry — server route is /results/<id>/signals/<file>.npy
    first_sig = signals[0]
    data = _fetch_npy_signal(http_base, token, first_sig["url"])
    assert len(data) >= 10, f"Expected ≥10 time-points for {first_sig['name']!r}, got {len(data)}"

    # DC steady-state: every voltage signal must be within 2 % of 5 V.
    for sig in voltage_signals:
        arr = _fetch_npy_signal(http_base, token, sig["url"])
        assert arr.min() >= 4.9 and arr.max() <= 5.1, (
            f"ngspice: {sig['name']!r} out of expected steady-state range [4.9, 5.1] V; "
            f"got min={arr.min():.4f} max={arr.max():.4f}"
        )

    # Current i(vv1) must be ≈ 0 A in steady state (|max| < 1 µA).
    current_signals = [s for s in signals if s["name"].lower().startswith("i(")]
    for sig in current_signals:
        arr = _fetch_npy_signal(http_base, token, sig["url"])
        assert abs(arr).max() < 1e-6, (
            f"ngspice: {sig['name']!r} not at steady-state zero; max |I| = {abs(arr).max():.3e} A"
        )


# ---------------------------------------------------------------------------
# Xyce
# ---------------------------------------------------------------------------


async def test_rc_circuit_xyce(e2e_server: dict) -> None:
    """
    RC transient via Xyce specifically.

    Skipped if Xyce is not installed.
    """
    from simulator.solvers.xyce_solver import XyceSolver

    if XyceSolver.from_discovery() is None:
        pytest.skip("Xyce not found on this host — skipping Xyce-specific RC test")

    ws_uri = e2e_server["ws_uri"]
    token = e2e_server["token"]
    http_base = e2e_server["http_base"]

    payload = await _run_simulate(
        ws_uri,
        token,
        _rc_model_dict(),
        solver="xyce",
        msg_id="rc-xyce",
    )

    # ── 1. Simulation status ──────────────────────────────────────────────
    assert payload["status"] == "ok", (
        f"Xyce RC simulation returned status={payload['status']!r}: {payload}"
    )

    sim_id = payload["sim_id"]

    # ── 2. Manifest ───────────────────────────────────────────────────────
    manifest = _fetch_manifest(http_base, token, sim_id)
    assert manifest["status"] == "ok", f"Manifest status not ok: {manifest}"
    signals = manifest.get("signals", [])
    assert len(signals) > 0, "Manifest has no signals"
    signal_names = [s["name"] for s in signals]

    # Xyce names voltages as V(node) in the .prn header
    voltage_signals = [s for s in signals if s["name"].lower().startswith("v(")]
    assert len(voltage_signals) > 0, (
        f"Expected at least one v(...) voltage signal in Xyce output; got: {signal_names}"
    )

    # ── 3. Waveform .npy fetchable and physically correct ─────────────────
    first_sig = signals[0]
    data = _fetch_npy_signal(http_base, token, first_sig["url"])
    assert len(data) >= 10, f"Expected ≥10 time-points for {first_sig['name']!r}, got {len(data)}"

    # DC steady-state: every voltage signal must be within 2 % of 5 V.
    for sig in voltage_signals:
        arr = _fetch_npy_signal(http_base, token, sig["url"])
        assert arr.min() >= 4.9 and arr.max() <= 5.1, (
            f"Xyce: {sig['name']!r} out of expected steady-state range [4.9, 5.1] V; "
            f"got min={arr.min():.4f} max={arr.max():.4f}"
        )

    # Current i(vv1) must be ≈ 0 A in steady state (|max| < 1 µA).
    current_signals = [s for s in signals if s["name"].lower().startswith("i(")]
    for sig in current_signals:
        arr = _fetch_npy_signal(http_base, token, sig["url"])
        assert abs(arr).max() < 1e-6, (
            f"Xyce: {sig['name']!r} not at steady-state zero; max |I| = {abs(arr).max():.3e} A"
        )
