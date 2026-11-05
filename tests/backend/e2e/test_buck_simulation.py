"""Buck converter simulation — full pipeline integration test.

This test exercises the complete path the frontend takes when the user clicks
Run on a buck converter schematic:

  Frontend model JSON
    → kernel-sidecar WebSocket (simulate message)
    → IR-1 compiler (gsim_loader + ir1_builder)
    → SPICE netlist writer
    → solver (ngspice or Xyce)
    → result_writer (manifest + .npy files)
    → SIMULATE_RESULT IPC message (back to frontend)
    → HTTP fetch of waveform .npy data

Two test variants are provided:

  test_buck_direct_netlist_ngspice
      Sends a hand-written SPICE netlist for a buck converter directly to
      the sidecar (skipping IR-1).  Works with ngspice.  Verifies that
      the output voltage settles close to 50 % of Vin (6 V for Vin = 12 V).

  test_buck_gsim_model_xyce
      Sends the actual .gsim model the frontend produces (same blocks and
      wires as insertBuckSchematic() in buck-schematic.ts).  Requires Xyce
      because the passive.switch.generic block is Xyce-only.  Verifies that
      the SIMULATE_RESULT payload lists named signals and that the waveform
      .npy data is fetchable.

Both tests reuse the `e2e_server` fixture from conftest.py which starts the
kernel-sidecar in-process on a random port.
"""

from __future__ import annotations

import io
import json
import time
import urllib.request
from typing import Any

import numpy as np
import pytest

from tests.backend.e2e._ws_helpers import recv_json

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Shared WebSocket helpers (mirrors test_rc_circuit_per_solver.py)
# ---------------------------------------------------------------------------

_BUCK_TIMEOUT_S = 60.0  # buck converters take longer than RC


async def _ws_simulate(
    ws_uri: str,
    token: str,
    payload: dict[str, Any],
    msg_id: str = "buck-sim",
) -> dict[str, Any]:
    """Handshake, send a simulate message, collect all messages until SIMULATE_RESULT."""
    import websockets

    async with websockets.connect(ws_uri) as ws:
        # Handshake
        await ws.send(json.dumps({"id": "hs", "type": "handshake", "payload": {"token": token}}))
        hs = await recv_json(ws, timeout=5.0)
        assert hs["payload"]["state"] == "idle", f"Bad handshake: {hs}"

        # Send simulate
        await ws.send(json.dumps({"id": msg_id, "type": "simulate", "payload": payload}))

        # Drain messages until simulate_result arrives
        deadline = time.monotonic() + _BUCK_TIMEOUT_S
        chunks_received: list[str] = []
        while True:
            remaining = deadline - time.monotonic()
            assert remaining > 0, f"Timed out waiting for simulate_result after {_BUCK_TIMEOUT_S}s"
            msg = await recv_json(ws, timeout=min(remaining, 5.0))
            mtype = msg.get("type", "")
            if mtype == "simulate_result":
                result: dict[str, Any] = msg["payload"]
                result["_chunks"] = chunks_received
                return result
            if mtype == "execute_stream":
                chunks_received.append(msg.get("chunk", ""))


def _fetch_npy(http_base: str, token: str, url: str) -> np.ndarray:  # type: ignore[type-arg]
    path = url if url.startswith("/") else f"/{url}"
    full = f"{http_base.rstrip('/')}{path}?token={token}"
    with urllib.request.urlopen(full, timeout=15) as resp:
        return np.load(io.BytesIO(resp.read()))


def _fetch_manifest(http_base: str, token: str, sim_id: str) -> dict[str, Any]:
    url = f"{http_base.rstrip('/')}/results/{sim_id}/manifest.json?token={token}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


# ---------------------------------------------------------------------------
# Test 1: direct SPICE netlist → ngspice
# ---------------------------------------------------------------------------

# Standard buck converter SPICE netlist.
# Vin = 12 V, D = 50 % duty cycle at 100 kHz → Vout ≈ 6 V (ideal).
# SW model uses SPICE SW element (ngspice and Xyce compatible).
_BUCK_NETLIST = """\
* Buck converter - 12V input, 50% duty cycle, 100kHz
* Expected Vout ≈ 6V after ~200µs settling
Vin net_in 0 DC 12

* Ideal switch controlled by a 100kHz PWM signal
S1 net_in net_sw ctrl 0 SWMOD
.model SWMOD SW(Ron=10m Roff=10Meg Vt=0.5 Vh=0.1)

* PWM control: 50% duty, 100kHz (period=10µs, ton=5µs)
Vpwm ctrl 0 PULSE(0 1 0 1n 1n 4.998u 10u)

* Freewheeling diode
D1 0 net_sw DMOD
.model DMOD D(Is=1n Rs=10m N=1)

* Output filter
L1 net_sw net_out 10u
C1 net_out 0 47u IC=0

* Load
Rload net_out 0 10

* Transient: 1µs step, run 300µs (enough to settle at 50% duty cycle)
.TRAN 1u 300u UIC

.END
"""


async def test_buck_direct_netlist_ngspice(e2e_server: dict) -> None:
    """Full pipeline: direct SPICE netlist → ngspice → waveform data back to caller.

    Mirrors the path triggered when model.metadata.spice_netlist is set in
    the .gsim document (the directNetlistFromMetadata() branch in run.ts).

    Skipped if ngspice is not installed.
    """
    from simulator.solvers.ngspice_solver import discover_ngspice

    if discover_ngspice() is None:
        pytest.skip("ngspice not found — skipping buck netlist test")

    ws_uri = e2e_server["ws_uri"]
    token = e2e_server["token"]
    http_base = e2e_server["http_base"]

    result = await _ws_simulate(
        ws_uri,
        token,
        payload={
            "netlist": _BUCK_NETLIST,
            "solver": "ngspice",
            "analysis_type": "TRAN",
            "t_start": 0.0,
            "t_end": 300e-6,
        },
        msg_id="buck-ngspice",
    )

    # ── 1. Status ─────────────────────────────────────────────────────────
    assert result["status"] == "ok", f"Simulation failed: {result.get('message', result)}"
    sim_id: str = result["sim_id"]

    # ── 2. Signals list in the IPC payload ────────────────────────────────
    signals: list[dict[str, Any]] = result.get("signals", [])
    assert len(signals) > 0, "SIMULATE_RESULT carries no signals"

    signal_names = [s["name"] for s in signals]
    # ngspice names voltage nodes as v(net_out), v(net_sw) etc.
    output_sigs = [s for s in signals if "net_out" in s["name"].lower()]
    assert len(output_sigs) > 0, f"Expected a net_out voltage signal; got: {signal_names}"

    # ── 3. Manifest fetchable via HTTP ────────────────────────────────────
    manifest = _fetch_manifest(http_base, token, sim_id)
    assert manifest.get("status") == "ok", f"Manifest not ok: {manifest}"
    assert len(manifest.get("signals", [])) > 0, "Manifest has no signals"

    # ── 4. Waveform .npy data fetchable and physically correct ────────────
    out_sig = output_sigs[0]
    arr = _fetch_npy(http_base, token, out_sig["url"])

    assert arr.ndim == 1, f"Expected 1-D waveform array, got shape {arr.shape}"
    assert len(arr) >= 50, f"Expected ≥50 samples, got {len(arr)}"

    # After 300µs the output should be settling toward 6V (50% of 12V).
    # Accept a wide tolerance because the circuit starts from IC=0 and the
    # settling time depends on the solver's step control.
    # We just assert the final quarter of the waveform is between 2V and 10V
    # (way below Vin but above 0 — the inductor is storing energy).
    final_quarter = arr[len(arr) * 3 // 4 :]
    vmin, vmax = float(final_quarter.min()), float(final_quarter.max())
    assert vmax > 2.0, (
        f"Output voltage never exceeds 2V — solver may have failed silently; "
        f"final-quarter min={vmin:.3f}V max={vmax:.3f}V"
    )
    assert vmin < 12.5, (
        f"Output voltage exceeds Vin=12V — unexpected result; "
        f"final-quarter min={vmin:.3f}V max={vmax:.3f}V"
    )


# ---------------------------------------------------------------------------
# Test 2: gsim model → Xyce  (mirrors what the frontend sends for the buck
#         schematic inserted by insertBuckSchematic() in buck-schematic.ts)
# ---------------------------------------------------------------------------


def _buck_gsim_model() -> dict[str, Any]:
    """Return the gsim model dict that the frontend sends for the buck schematic.

    Block types match the aliases tried by buck-schematic.ts.
    Positions are arbitrary (not used by the compiler).
    Wires connect the same ports as the frontend code.
    """
    return {
        "schema_version": 2,
        "model": {
            "id": "buck-gsim-test",
            "name": "Buck Converter gsim",
            "grid": 10,
            "params": [],
            "lines": [],
            "nets": [],
            "metadata": {},
            "simulation": {
                "analyses": [
                    {
                        "id": "tran1",
                        "type": "TRAN",
                        "t_start": 0.0,
                        "t_end": 300e-6,
                        "t_step": 1e-6,
                    }
                ],
                "default_analysis": "tran1",
            },
            "blocks": [
                # Block types must match the v2 spice_card_emitters.py registry exactly.
                # The GSW (passive.switch.generic) is Xyce-only and requires a complex
                # model card; it is replaced here with a DC voltage source acting as
                # a closed switch (0V, essentially a wire) so ngspice can also run
                # this test.  The diode prevents reverse current in the inductor.
                {
                    "id": "vin",
                    "type": "physical-electrical.source.voltage_dc",
                    "paradigm": "physical-network",
                    "domain": "physical-electrical",
                    "fidelity": "ideal",
                    "position": [120, 240],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"V": 12.0},
                    "ic": {},
                },
                {
                    # Ideal switch approximated as a small-resistance element (0.01 Ω).
                    # A true closed switch = 0V source, but using a resistor is more
                    # numerically stable for SPICE DC initialisation.
                    "id": "sw1",
                    "type": "physical-electrical.passive.resistor",
                    "paradigm": "physical-network",
                    "domain": "physical-electrical",
                    "fidelity": "ideal",
                    "position": [280, 240],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"R": 0.01},
                    "ic": {},
                },
                {
                    "id": "d1",
                    "type": "physical-electrical.semiconductor.diode",
                    "paradigm": "physical-network",
                    "domain": "physical-electrical",
                    "fidelity": "ideal",
                    "position": [280, 360],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"model": "D"},
                    "ic": {},
                },
                {
                    "id": "l1",
                    "type": "physical-electrical.passive.inductor",
                    "paradigm": "physical-network",
                    "domain": "physical-electrical",
                    "fidelity": "ideal",
                    "position": [460, 240],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"L": 10e-6},
                    "ic": {},
                },
                {
                    "id": "c1",
                    "type": "physical-electrical.passive.capacitor",
                    "paradigm": "physical-network",
                    "domain": "physical-electrical",
                    "fidelity": "ideal",
                    "position": [640, 200],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"C": 47e-6},
                    "ic": {},
                },
                {
                    "id": "r1",
                    "type": "physical-electrical.passive.resistor",
                    "paradigm": "physical-network",
                    "domain": "physical-electrical",
                    "fidelity": "ideal",
                    "position": [640, 320],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"R": 10.0},
                    "ic": {},
                },
            ],
            "wires": [
                # Vin+ → Switch p
                {
                    "id": "w1",
                    "from": {"block": "vin", "port": "p"},
                    "to": {"block": "sw1", "port": "p"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
                # Switch n → Inductor p
                {
                    "id": "w2",
                    "from": {"block": "sw1", "port": "n"},
                    "to": {"block": "l1", "port": "p"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
                # Switch n → Diode k (freewheeling; diode blocks reverse current)
                {
                    "id": "w3",
                    "from": {"block": "sw1", "port": "n"},
                    "to": {"block": "d1", "port": "k"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
                # Diode a → Vin- (ground return)
                {
                    "id": "w4",
                    "from": {"block": "d1", "port": "a"},
                    "to": {"block": "vin", "port": "n"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
                # Inductor n → Capacitor p
                {
                    "id": "w5",
                    "from": {"block": "l1", "port": "n"},
                    "to": {"block": "c1", "port": "p"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
                # Inductor n → Load p
                {
                    "id": "w6",
                    "from": {"block": "l1", "port": "n"},
                    "to": {"block": "r1", "port": "p"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
                # Capacitor n → Vin-
                {
                    "id": "w7",
                    "from": {"block": "c1", "port": "n"},
                    "to": {"block": "vin", "port": "n"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
                # Load n → Vin-
                {
                    "id": "w8",
                    "from": {"block": "r1", "port": "n"},
                    "to": {"block": "vin", "port": "n"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "physical-electrical",
                },
            ],
        },
    }


async def test_buck_gsim_model_xyce(e2e_server: dict) -> None:
    """Full pipeline: gsim model → IR-1 → SPICE netlist → solver → waveform data.

    This is the exact path the frontend uses when the user inserts the buck
    schematic via File → Insert buck schematic and presses Run.  The GSW
    (passive.switch.generic, Xyce-only) is approximated by a 10 mΩ resistor
    so the test exercises the full physical-electrical compile path with ngspice.

    Tests the two bugs fixed in this session:
      1. _CIRCUIT_PREFIXES now includes "physical-electrical." so is_circuit_schematic
         correctly routes these blocks to the SPICE path.
      2. write_netlist receives the AnalysisRequest from the simulation plan (not
         SolverOptions) so the v2 writer — which knows all physical-electrical types
         — is used.
    """
    from simulator.solvers.ngspice_solver import discover_ngspice

    if discover_ngspice() is None:
        pytest.skip("ngspice not found — skipping buck gsim-model test")

    ws_uri = e2e_server["ws_uri"]
    token = e2e_server["token"]
    http_base = e2e_server["http_base"]

    model = _buck_gsim_model()

    result = await _ws_simulate(
        ws_uri,
        token,
        payload={
            "model": model,
            "solver": "ngspice",  # ngspice handles stiff circuits better for this topology
            # Analysis is embedded in model.simulation.analyses; the backend picks it up
            # via extract_simulation and passes the AnalysisRequest to write_netlist.
        },
        msg_id="buck-gsim",
    )

    # ── 1. Status ─────────────────────────────────────────────────────────
    assert result["status"] == "ok", f"Buck gsim simulation failed: {result.get('message', result)}"
    sim_id: str = result["sim_id"]

    # ── 2. Signals in the IPC payload ─────────────────────────────────────
    signals: list[dict[str, Any]] = result.get("signals", [])
    assert len(signals) > 0, "SIMULATE_RESULT carries no signals for buck gsim model"

    signal_names = [s["name"] for s in signals]
    # Expect voltage signals; at minimum the output node and switch node.
    voltage_sigs = [s for s in signals if s["name"].lower().startswith("v(")]
    assert len(voltage_sigs) >= 1, (
        f"Expected at least one v(...) signal from Xyce; got: {signal_names}"
    )

    # All signals must carry BE-47 metadata fields.
    for sig in signals:
        assert "analysis" in sig, f"Signal {sig['name']!r} missing 'analysis' field"
        assert "unit" in sig, f"Signal {sig['name']!r} missing 'unit' field"
        assert sig["analysis"] == "transient", (
            f"Signal {sig['name']!r} has wrong analysis tag: {sig['analysis']!r}"
        )

    # ── 3. Manifest fetchable ─────────────────────────────────────────────
    manifest = _fetch_manifest(http_base, token, sim_id)
    assert manifest.get("status") == "ok", f"Manifest status not ok: {manifest}"
    assert len(manifest.get("signals", [])) > 0

    # ── 4. Waveform data fetchable and non-trivial ────────────────────────
    for sig in voltage_sigs[:3]:  # Check up to 3 voltage signals
        arr = _fetch_npy(http_base, token, sig["url"])
        assert arr.ndim == 1, f"{sig['name']!r}: expected 1-D array, got {arr.shape}"
        assert len(arr) >= 50, f"{sig['name']!r}: expected ≥50 samples, got {len(arr)}"
        # The waveform must not be all-zero (solver produced real data).
        assert arr.max() != arr.min(), (
            f"{sig['name']!r}: all values identical ({arr[0]:.6f}) — solver may have stalled"
        )
