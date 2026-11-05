"""FE-92 — Direct SPICE netlist demo path, hardened with progress + health.

Covers the "netlist in, simulation data out" flow (the kicad/qucs-style path
that skips IR-1 entirely): a hand-written SPICE netlist goes straight to
ngspice/Xyce and comes back as waveform data over the kernel-sidecar
WebSocket + HTTP result endpoints.

Test groups:

  test_direct_netlist_ngspice_rc
      Sends a direct netlist using the *current* run.ts wire contract
      (top-level netlist/analysis_type/t_end/t_step, no nested "options"
      dict) and checks the RC charging curve is physically correct.

  test_direct_netlist_progress_heartbeat_ngspice
      Asserts the simulate_progress heartbeat added alongside the direct
      netlist path emits a well-formed 0.0 -> 1.0 monotonic sequence on the
      WebSocket, independent of solve duration.

  test_health_endpoint_*
      Unit-level tests of the /health HTTP route added to slice_server.py:
      token auth, idle default, and reporting an in-flight simulation's
      progress/message/elapsed time. Exercised directly against handle_http
      with a stub ctx so results don't depend on solver wall-clock timing.

  test_buck_demo_artifacts
      Confirms the buck converter demo artifacts (schematic, netlist,
      screenshots) referenced by the FE-92 epic are still on disk.
"""

from __future__ import annotations

import asyncio
import io
import json
import math
import pathlib
import time
import urllib.request
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest

from tests.backend.e2e._ws_helpers import recv_json

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_TIMEOUT_S = 30.0


# ---------------------------------------------------------------------------
# Shared WebSocket helpers
# ---------------------------------------------------------------------------


async def _ws_simulate(
    ws_uri: str,
    token: str,
    payload: dict[str, Any],
    msg_id: str = "direct-netlist",
    *,
    collect_progress: bool = False,
) -> dict[str, Any]:
    """Handshake, send a simulate message, collect messages until simulate_result.

    When collect_progress is True, the returned dict carries the ordered list
    of simulate_progress payloads under the "_progress" key.
    """
    import websockets

    async with websockets.connect(ws_uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        hs = await recv_json(ws, timeout=5.0)
        assert hs["payload"]["state"] == "idle", f"Bad handshake: {hs}"

        await ws.send(json.dumps({"id": msg_id, "type": "simulate", "payload": payload}))

        deadline = time.monotonic() + _TIMEOUT_S
        progress_msgs: list[dict[str, Any]] = []
        while True:
            remaining = deadline - time.monotonic()
            assert remaining > 0, f"Timed out waiting for simulate_result after {_TIMEOUT_S}s"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            mtype = msg.get("type", "")
            if mtype == "simulate_progress" and collect_progress:
                progress_msgs.append(msg["payload"])
            if mtype == "simulate_result":
                result: dict[str, Any] = msg["payload"]
                if collect_progress:
                    result["_progress"] = progress_msgs
                return result


def _fetch_npy(http_base: str, token: str, url: str) -> np.ndarray:  # type: ignore[type-arg]
    path = url if url.startswith("/") else f"/{url}"
    full = f"{http_base.rstrip('/')}{path}?token={token}"
    with urllib.request.urlopen(full, timeout=15) as resp:
        return np.load(io.BytesIO(resp.read()))


def _fetch_manifest(http_base: str, token: str, sim_id: str) -> dict[str, Any]:
    url = f"{http_base.rstrip('/')}/results/{sim_id}/manifest.json?token={token}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


# RC charging netlist. V1=5V DC through R1=1k into C1=1uF, IC=0 UIC so the
# capacitor starts uncharged and actually charges over the transient (rather
# than SPICE's default DC-operating-point steady-state initialisation).
# Tau = R*C = 1ms; after 5ms (5 tau) the output should be within ~1% of 5V.
_RC_NETLIST = """\
* RC charging circuit - V1=5V, R1=1k, C1=1uF, tau=1ms
V1 in 0 DC 5
R1 in out 1k
C1 out 0 1u IC=0
.TRAN 10u 5m UIC
.END
"""


# ---------------------------------------------------------------------------
# Direct netlist -> ngspice, using the current run.ts wire contract
# ---------------------------------------------------------------------------


async def test_direct_netlist_ngspice_rc(e2e_server: dict) -> None:
    """Direct netlist payload matching run.ts's current SimulateRequest shape:
    top-level netlist/analysis_type/t_end/t_step (no nested "options" dict,
    no "model" key at all — this must not touch IR-1).

    Skipped if ngspice is not installed.
    """
    from simulator.solvers.ngspice_solver import discover_ngspice

    if discover_ngspice() is None:
        pytest.skip("ngspice not found — skipping direct netlist RC test")

    ws_uri = e2e_server["ws_uri"]
    token = e2e_server["token"]
    http_base = e2e_server["http_base"]

    result = await _ws_simulate(
        ws_uri,
        token,
        payload={
            "netlist": _RC_NETLIST,
            "solver": "ngspice",
            "analysis_type": "TRAN",
            "t_end": 5e-3,
            "t_step": 10e-6,
        },
        msg_id="rc-direct-ngspice",
    )

    # ── 1. Status ─────────────────────────────────────────────────────────
    assert result["status"] == "ok", f"Simulation failed: {result.get('message', result)}"
    sim_id: str = result["sim_id"]

    # ── 2. Signals in the IPC payload ─────────────────────────────────────
    signals: list[dict[str, Any]] = result.get("signals", [])
    assert len(signals) > 0, "SIMULATE_RESULT carries no signals"
    signal_names = [s["name"] for s in signals]
    out_sigs = [s for s in signals if "out" in s["name"].lower()]
    assert len(out_sigs) > 0, f"Expected a v(out) signal; got: {signal_names}"

    # ── 3. Manifest fetchable via HTTP ────────────────────────────────────
    manifest = _fetch_manifest(http_base, token, sim_id)
    assert manifest.get("status") == "ok", f"Manifest not ok: {manifest}"

    # ── 4. Waveform data is the correct RC charging curve ─────────────────
    arr = _fetch_npy(http_base, token, out_sigs[0]["url"])
    assert arr.ndim == 1
    assert len(arr) >= 50, f"Expected >=50 samples, got {len(arr)}"

    # Charging from 0V toward 5V with tau=1ms; after 5ms (5 tau) expect
    # within ~5% of the ideal 5*(1-e^-5) ≈ 4.966V asymptote.
    ideal_final = 5.0 * (1.0 - math.exp(-5.0))
    final_value = float(arr[-1])
    assert final_value == pytest.approx(ideal_final, abs=0.25), (
        f"Final output {final_value:.4f}V not close to ideal RC asymptote {ideal_final:.4f}V"
    )
    # Must actually be charging (not flat at 0 or flat at 5 from the start).
    assert float(arr[0]) < 0.5, f"Output should start near 0V (IC=0), got {arr[0]:.4f}V"


# ---------------------------------------------------------------------------
# simulate_progress heartbeat over the direct netlist path
# ---------------------------------------------------------------------------


async def test_direct_netlist_progress_heartbeat_ngspice(e2e_server: dict) -> None:
    """The heartbeat added for opaque blocking solves (_run_with_heartbeat)
    must emit a well-formed progress sequence on the WebSocket regardless of
    how fast the underlying ngspice subprocess finishes: starts at 0.0, ends
    at 1.0, monotonically non-decreasing, with a "message" string attached
    to every frame.
    """
    from simulator.solvers.ngspice_solver import discover_ngspice

    if discover_ngspice() is None:
        pytest.skip("ngspice not found — skipping progress heartbeat test")

    ws_uri = e2e_server["ws_uri"]
    token = e2e_server["token"]

    result = await _ws_simulate(
        ws_uri,
        token,
        payload={
            "netlist": _RC_NETLIST,
            "solver": "ngspice",
            "analysis_type": "TRAN",
            "t_end": 5e-3,
            "t_step": 10e-6,
        },
        msg_id="rc-direct-progress",
        collect_progress=True,
    )

    assert result["status"] == "ok", f"Simulation failed: {result.get('message', result)}"

    progress: list[dict[str, Any]] = result["_progress"]
    assert len(progress) >= 2, f"Expected at least a start and end frame, got: {progress}"

    fracs = [float(p["frac"]) for p in progress]
    assert fracs[0] == pytest.approx(0.0), f"First frame should be 0.0, got {fracs[0]}"
    assert fracs[-1] == pytest.approx(1.0), f"Last frame should be 1.0, got {fracs[-1]}"
    assert fracs == sorted(fracs), f"Progress must be monotonically non-decreasing: {fracs}"
    assert all(0.0 <= f <= 1.0 for f in fracs), f"Progress out of [0,1] range: {fracs}"

    for frame in progress:
        assert isinstance(frame.get("message"), str), f"Missing/bad 'message' field: {frame}"


# ---------------------------------------------------------------------------
# BE-53 — simulate_cancel actually stops an in-flight ngspice subprocess
# ---------------------------------------------------------------------------

# ~4-5s of real ngspice wall-clock time (3,000,000 transient points on a
# trivial RC circuit) — long enough that a cancel sent shortly after launch
# reliably lands while the subprocess is still running, short enough to keep
# the test fast if cancellation is broken and we fall through to the full
# uncancelled duration.
_SLOW_RC_NETLIST = """\
* Slow RC circuit — deliberately fine timestep so cancellation has time to land
V1 in 0 DC 5
R1 in out 1k
C1 out 0 1u IC=0
.TRAN 1n 3m UIC
.END
"""


async def test_direct_netlist_cancel_stops_running_ngspice(e2e_server: dict) -> None:
    """BE-53: simulate_cancel must terminate an ngspice subprocess already in
    flight, not just refuse to launch one that hasn't started yet.

    Before BE-53, NgspiceSolver.solve() only checked the cancel token before
    subprocess.run() — once launched, cancellation had no effect until the
    solver finished on its own. This sends a netlist that takes ~4-5s of real
    ngspice wall-clock time, cancels shortly after launch, and asserts the
    Cancelled result arrives in well under half that time.
    """
    import websockets

    from simulator.solvers.ngspice_solver import discover_ngspice

    if discover_ngspice() is None:
        pytest.skip("ngspice not found — skipping cancellation test")

    ws_uri = e2e_server["ws_uri"]
    token = e2e_server["token"]

    async with websockets.connect(ws_uri) as ws:
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        hs = await recv_json(ws, timeout=5.0)
        assert hs["payload"]["state"] == "idle"

        await ws.send(
            json.dumps(
                {
                    "id": "rc-slow-cancel",
                    "type": "simulate",
                    "payload": {
                        "netlist": _SLOW_RC_NETLIST,
                        "solver": "ngspice",
                        "analysis_type": "TRAN",
                        "t_end": 3e-3,
                        "t_step": 1e-9,
                    },
                }
            )
        )

        # Give ngspice a moment to actually be running (not just requested),
        # then cancel — well before the ~4-5s natural completion time.
        await asyncio.sleep(0.5)
        cancel_sent_at = time.monotonic()
        await ws.send(
            json.dumps({"id": "rc-slow-cancel", "type": "simulate_cancel", "payload": {}})
        )

        deadline = time.monotonic() + 10.0
        result_payload: dict[str, Any] | None = None
        while True:
            remaining = deadline - time.monotonic()
            assert remaining > 0, "Timed out waiting for a Cancelled simulate_result"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            if msg.get("type") == "simulate_result":
                result_payload = msg["payload"]
                break

        elapsed_after_cancel = time.monotonic() - cancel_sent_at

    assert result_payload is not None
    assert result_payload["status"] == "error"
    assert "Cancelled" in json.dumps(result_payload), (
        f"Expected a Cancelled result, got: {result_payload}"
    )
    assert elapsed_after_cancel < 3.0, (
        f"Cancellation took {elapsed_after_cancel:.2f}s to take effect — the "
        "subprocess should be terminated within a couple of poll intervals, "
        "not left running to completion (~4-5s)"
    )


# ---------------------------------------------------------------------------
# /health endpoint (BE — added alongside the direct netlist progress work)
# ---------------------------------------------------------------------------


def _import_handle_http():  # type: ignore[no-untyped-def]
    from kernel_sidecar.waveform.slice_server import handle_http

    return handle_http


async def test_health_endpoint_idle_when_no_simulation(tmp_path: pathlib.Path) -> None:
    handle_http = _import_handle_http()
    token = "test-token-idle"
    ctx = SimpleNamespace(simulate_tasks={}, sim_progress=0.0, sim_message="", sim_started_at=None)

    status, _headers, body = await handle_http(f"/health?token={token}", {}, tmp_path, token, ctx)

    assert status == 200
    payload = json.loads(body)
    assert payload["status"] == "idle"
    assert payload["active_sims"] == 0
    assert payload["progress"] == 0.0


async def test_health_endpoint_reports_running_simulation(tmp_path: pathlib.Path) -> None:
    handle_http = _import_handle_http()
    token = "test-token-running"
    started_at = time.time() - 2.0
    ctx = SimpleNamespace(
        simulate_tasks={"sim-42": object()},
        sim_progress=0.42,
        sim_message="Solving…",
        sim_started_at=started_at,
    )

    status, _headers, body = await handle_http(f"/health?token={token}", {}, tmp_path, token, ctx)

    assert status == 200
    payload = json.loads(body)
    assert payload["status"] == "running"
    assert payload["progress"] == pytest.approx(0.42)
    assert payload["message"] == "Solving…"
    assert payload["active_sims"] == 1
    assert payload["elapsed_s"] >= 1.9


async def test_health_endpoint_rejects_bad_token(tmp_path: pathlib.Path) -> None:
    handle_http = _import_handle_http()
    ctx = SimpleNamespace(simulate_tasks={}, sim_progress=0.0, sim_message="", sim_started_at=None)

    status, _headers, _body = await handle_http(
        "/health?token=wrong-token", {}, tmp_path, "correct-token", ctx
    )

    assert status == 401


async def test_health_endpoint_tolerates_missing_ctx(tmp_path: pathlib.Path) -> None:
    """ctx=None (e.g. a caller that hasn't wired up KernelContext) must not crash."""
    handle_http = _import_handle_http()
    token = "test-token-no-ctx"

    status, _headers, body = await handle_http(f"/health?token={token}", {}, tmp_path, token, None)

    assert status == 200
    payload = json.loads(body)
    assert payload["status"] == "idle"
    assert payload["active_sims"] == 0


async def test_health_endpoint_reachable_on_live_server(e2e_server: dict) -> None:
    """Smoke-check /health against the real in-process server (BG-02-style
    wiring check): the route must be reachable end-to-end through
    run_server -> _connection_handler -> handle_http, not just importable.
    """
    http_base = e2e_server["http_base"]
    token = e2e_server["token"]

    url = f"{http_base.rstrip('/')}/health?token={token}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read())
    assert payload["status"] == "idle"

    bad_url = f"{http_base.rstrip('/')}/health?token=wrong"
    try:
        urllib.request.urlopen(bad_url, timeout=10)
        raise AssertionError("Expected HTTPError for bad token")
    except urllib.error.HTTPError as exc:
        assert exc.code == 401


# ---------------------------------------------------------------------------
# Buck converter demo artifacts (original FE-92 acceptance)
# ---------------------------------------------------------------------------


def test_buck_demo_artifacts() -> None:
    """The buck converter demo session's saved artifacts must still exist:
    schematic document, generated netlist, waveform summary/CSV, and the
    frontend screenshots referenced in the FE-92 epic review.
    """
    demo_dir = _REPO_ROOT / "docs" / "circuit_test" / "buck_converter"
    required = [
        "buck_converter.gsim_sch",
        "buck_converter.sp",
        "buck_waveform_summary.json",
        "buck_vout_samples.csv",
        "frontend_buck_schematic.png",
        "frontend_buck_waveform.png",
    ]
    missing = [name for name in required if not (demo_dir / name).is_file()]
    assert not missing, f"Missing buck demo artifacts in {demo_dir}: {missing}"

    summary = json.loads((demo_dir / "buck_waveform_summary.json").read_text())
    assert summary, "buck_waveform_summary.json is empty"
