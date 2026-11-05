from __future__ import annotations

import asyncio
import json
import pathlib
import socket

import numpy as np
import pytest

from kernel_sidecar.waveform.slice_server import SliceServer
from simulator.postprocess.hdf5_store import write_hdf5
from simulator.postprocess.result_writer import ResultBundle, SignalArray

pytestmark = pytest.mark.asyncio


async def _get(url: str, token: str | None = None) -> tuple[int, dict[str, object] | bytes]:
    import aiohttp

    params = {"token": token} if token is not None else {}
    async with aiohttp.ClientSession() as session, session.get(url, params=params) as resp:
        body = await resp.read()
        if resp.headers.get("Content-Type", "").startswith("application/json"):
            return resp.status, json.loads(body.decode("utf-8"))
        return resp.status, body


@pytest.fixture
async def lod_server(tmp_path: pathlib.Path):  # type: ignore[misc]
    sim_id = "lod-sim"
    token = "tok-lod-123"

    sim_dir = tmp_path / "results" / sim_id
    sim_dir.mkdir(parents=True)

    t = np.linspace(0.0, 1.0, 10_000, dtype=np.float64)
    y = np.sin(2.0 * np.pi * 50.0 * t).astype(np.float32)
    bundle = ResultBundle(
        sim_id=sim_id,
        t_start=0.0,
        t_end=1.0,
        time=t,
        signals=[SignalArray(name="scope.out", block_id="scope", port_id="out", data=y)],
    )
    write_hdf5(bundle, sim_dir / "data.h5")

    manifest = {
        "sim_id": sim_id,
        "schema_version": 2,
        "status": "ok",
        "n_points": len(t),
        "t_start": 0.0,
        "t_end": 1.0,
        "signals": [
            {
                "name": "scope.out",
                "block_id": "scope",
                "port_id": "out",
                "dtype": "float32",
                "shape": [len(t)],
                "url": f"results/{sim_id}/signals/scope__out.npy",
                "analysis": "transient",
                "quantity": "voltage",
                "unit": "V",
                "domain": "time",
            }
        ],
    }
    (sim_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    server = SliceServer(workdir=tmp_path, token=token, host="127.0.0.1", port=port)
    task = asyncio.create_task(server.start())
    await asyncio.sleep(0.1)

    try:
        yield f"http://127.0.0.1:{port}", token, sim_id
    finally:
        task.cancel()
        try:
            await task
        except Exception:
            pass


async def test_lod_caps_point_count(lod_server) -> None:  # type: ignore[no-untyped-def]
    base_url, token, sim_id = lod_server
    status, body = await _get(
        f"{base_url}/results/{sim_id}/lod?signals=scope.out&t_start=0&t_end=1&max_points=500",
        token,
    )

    assert status == 200
    assert isinstance(body, dict)
    t = body["t"]
    y = body["scope.out"]
    assert len(t) <= 500
    assert len(y) == len(t)


async def test_lod_subwindow_clamps_to_requested_range(lod_server) -> None:  # type: ignore[no-untyped-def]
    base_url, token, sim_id = lod_server
    status, body = await _get(
        f"{base_url}/results/{sim_id}/lod?signals=scope.out&t_start=0.3&t_end=0.7&max_points=400",
        token,
    )

    assert status == 200
    assert isinstance(body, dict)
    t = np.asarray(body["t"], dtype=np.float64)
    assert len(t) > 0
    assert float(np.min(t)) >= 0.3 - 1e-9
    assert float(np.max(t)) <= 0.7 + 1e-9


async def test_lod_missing_token_returns_401(lod_server) -> None:  # type: ignore[no-untyped-def]
    base_url, _token, sim_id = lod_server
    status, _body = await _get(
        f"{base_url}/results/{sim_id}/lod?signals=scope.out&t_start=0&t_end=1&max_points=128",
        None,
    )
    assert status == 401


async def test_lod_unknown_sim_id_returns_404(lod_server) -> None:  # type: ignore[no-untyped-def]
    base_url, token, _sim_id = lod_server
    status, _body = await _get(
        f"{base_url}/results/does-not-exist/lod?signals=scope.out&t_start=0&t_end=1&max_points=128",
        token,
    )
    assert status == 404
