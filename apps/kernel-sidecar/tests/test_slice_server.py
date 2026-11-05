"""BE-17 — Waveform slice HTTP endpoint tests.

Covers:
- GET /results/<sim_id>/manifest.json returns the manifest JSON.
- GET /results/<sim_id>/signals/<file>.npy returns raw bytes of that file.
- Path traversal attempts ('../') return 400.
- Requests without a token return 401.
"""

from __future__ import annotations

import asyncio
import json
import pathlib
import uuid

import numpy as np
import pytest

from simulator.postprocess.hdf5_store import write_hdf5
from simulator.postprocess.result_writer import ResultBundle, SignalArray

pytestmark = pytest.mark.asyncio


def _import_slice_server():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.waveform.slice_server import SliceServer

        return SliceServer
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.waveform.slice_server not yet implemented")


async def _get(url: str, token: str | None = None) -> tuple[int, bytes]:
    """Minimal async HTTP GET; returns (status_code, body_bytes)."""
    import aiohttp  # type: ignore[import]

    params = {"token": token} if token else {}
    async with aiohttp.ClientSession() as session, session.get(url, params=params) as resp:
        body = await resp.read()
        return resp.status, body


@pytest.fixture
async def slice_server(tmp_path: pathlib.Path):  # type: ignore[misc]
    """Spin up a SliceServer and yield (server, base_url, token, sim_id)."""
    SliceServer = _import_slice_server()
    import secrets
    import socket

    token = secrets.token_hex(32)
    sim_id = str(uuid.uuid4())

    # Create fixture data on disk
    results_dir = tmp_path / "results" / sim_id
    results_dir.mkdir(parents=True)

    arr = np.linspace(0, 1, 100, dtype="float32")
    bundle = ResultBundle(
        sim_id=sim_id,
        t_start=0.0,
        t_end=1.0,
        time=np.linspace(0.0, 1.0, 100, dtype=np.float64),
        signals=[SignalArray(name="blk.out", block_id="blk", port_id="out", data=arr)],
    )
    write_hdf5(bundle, results_dir / "data.h5")

    manifest = {
        "n_points": 100,
        "schema_version": 1,
        "signals": [
            {
                "block_id": "blk",
                "dtype": "float32",
                "name": "blk.out",
                "port_id": "out",
                "shape": [100],
                "url": f"/results/{sim_id}/signals/blk__out.npy",
            }
        ],
        "sim_id": sim_id,
        "status": "ok",
        "t_end": 1.0,
        "t_start": 0.0,
    }
    (results_dir / "manifest.json").write_text(
        json.dumps(manifest, sort_keys=True), encoding="utf-8"
    )

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    server = SliceServer(workdir=tmp_path, token=token, host="127.0.0.1", port=port)
    task = asyncio.create_task(server.start())
    await asyncio.sleep(0.1)

    try:
        yield server, f"http://127.0.0.1:{port}", token, sim_id
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


async def test_manifest_returns_json(slice_server) -> None:  # type: ignore[no-untyped-def]
    _, base_url, token, sim_id = slice_server
    status, body = await _get(f"{base_url}/results/{sim_id}/manifest.json", token=token)
    assert status == 200
    data = json.loads(body)
    assert data["sim_id"] == sim_id


async def test_signal_npy_returns_bytes(slice_server) -> None:  # type: ignore[no-untyped-def]
    _, base_url, token, sim_id = slice_server
    status, body = await _get(f"{base_url}/results/{sim_id}/signals/blk__out.npy", token=token)
    assert status == 200
    arr = np.frombuffer(body[128:] if len(body) > 128 else body, dtype="float32")
    # np.load from bytes — use the npy magic check
    import io

    recovered = np.load(io.BytesIO(body))
    assert recovered.dtype == np.float32
    assert len(recovered) == 100


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------


async def test_path_traversal_returns_400(slice_server) -> None:  # type: ignore[no-untyped-def]
    _, base_url, token, sim_id = slice_server
    # Attempt to read a file outside the results dir
    status, _ = await _get(f"{base_url}/results/{sim_id}/../../etc/passwd", token=token)
    assert status == 400, f"Path traversal must be rejected with 400, got {status}"


async def test_missing_token_returns_401(slice_server) -> None:  # type: ignore[no-untyped-def]
    _, base_url, _token, sim_id = slice_server
    status, _ = await _get(f"{base_url}/results/{sim_id}/manifest.json", token=None)
    assert status == 401, f"Missing token must return 401, got {status}"


async def test_wrong_token_returns_401(slice_server) -> None:  # type: ignore[no-untyped-def]
    _, base_url, _token, sim_id = slice_server
    status, _ = await _get(f"{base_url}/results/{sim_id}/manifest.json", token="wrong" * 8)
    assert status == 401, f"Wrong token must return 401, got {status}"
