"""Waveform slice HTTP server (BE-17, BE-48, BE-52).

Co-locates an HTTP handler on the same event loop as the WebSocket server.
Routes:
  GET /results/<sim_id>/manifest.json
  GET /results/<sim_id>/signals/<file>.npy
  GET /results/<sim_id>/lod?signals=s1,s2&t_start=0&t_end=1e-3&max_points=2000

Path traversal attempts are rejected with 400.
The session token is required as a ?token=… query parameter.

Since BE-52, signal data lives in a single ``data.h5`` per simulation (see
``simulator.postprocess.hdf5_store``) rather than loose ``.npy`` files. The
``/signals/<file>.npy`` route extracts the named dataset from ``data.h5`` and
re-serializes it with ``numpy.save`` into an in-memory buffer, so the bytes
on the wire are still a valid, byte-for-byte ``.npy`` file — the frontend's
``parseNpyFloatArray`` needs no changes.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import pathlib
import urllib.parse
from typing import Any

import h5py
import numpy as np

logger = logging.getLogger(__name__)


def _read_signal_npy_bytes(h5_path: pathlib.Path, key: str) -> bytes | None:
    """Extract /signals/<key> from data.h5 and re-serialize as .npy bytes.

    Returns None if the file or the dataset doesn't exist (caller maps to 404).
    """
    if not h5_path.exists():
        return None
    with h5py.File(h5_path, "r") as f:
        signals = f.get("signals")
        if signals is None or key not in signals:
            return None
        arr = signals[key][:].astype(np.float32)
    buf = io.BytesIO()
    np.save(buf, arr)
    return buf.getvalue()


def _reject_traversal(parts: list[str]) -> bool:
    """Return True if any path segment is suspicious."""
    return any(".." in part or part.startswith("/") or "\\" in part for part in parts)


def _with_cors(headers: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [
        *headers,
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type, Authorization"),
    ]


async def _handle_lod(
    qs: dict[str, list[str]],
    sim_dir: pathlib.Path,
) -> tuple[int, list[tuple[str, str]], bytes]:
    """Handle GET /results/<sim_id>/lod with min/max decimation.

    Query parameters:
      signals    — comma-separated signal names (required)
      t_start    — float, window start (default: 0.0)
      t_end      — float, window end (default: 1e30, effectively no upper clamp)
      max_points — int, maximum number of output samples (default: 2000)

    Returns a JSON body: {"t": [...], "<sig>": [...], ...} with at most
    *max_points* entries in every array, matching the LODResponse wire format
    expected by lod-client.ts.
    """
    from .lod import compute_lod_slice

    raw_signals = (qs.get("signals") or [""])[0]
    signal_names = [s.strip() for s in raw_signals.split(",") if s.strip()]

    try:
        t_start = float((qs.get("t_start") or ["0.0"])[0])
    except ValueError:
        t_start = 0.0

    try:
        t_end = float((qs.get("t_end") or ["1e30"])[0])
    except ValueError:
        t_end = 1e30

    try:
        max_points = max(2, int((qs.get("max_points") or ["2000"])[0]))
    except ValueError:
        max_points = 2000

    try:
        result = compute_lod_slice(sim_dir, signal_names, t_start, t_end, max_points)
    except Exception:
        logger.exception("LOD computation failed for %s", sim_dir)
        return (
            500,
            _with_cors([("Content-Type", "text/plain")]),
            b"500 Internal Server Error: LOD computation failed",
        )

    body = json.dumps(result).encode("utf-8")
    return (200, _with_cors([("Content-Type", "application/json")]), body)


async def handle_http(
    path: str,
    request_headers: Any,
    results_root: pathlib.Path,
    token: str,
    ctx: Any = None,
) -> tuple[int, list[tuple[str, str]], bytes] | None:
    """HTTP request handler for waveform slice and health requests.

    Returns (status, headers, body) or None to fall through to WebSocket handling.
    """
    # Normalize double-leading-slashes before parsing (urlparse treats //foo as netloc).
    normalized_path = "/" + path.lstrip("/")
    parsed = urllib.parse.urlparse(normalized_path)
    qs = urllib.parse.parse_qs(parsed.query)
    request_token = (qs.get("token") or [""])[0]

    path_str = parsed.path

    # Health endpoint — lightweight, token-gated.
    if path_str == "/health":
        import hmac

        if not hmac.compare_digest(request_token, token):
            return (
                401,
                _with_cors([("Content-Type", "text/plain")]),
                b"401 Unauthorized",
            )
        import time

        running = ctx is not None and bool(ctx.simulate_tasks)
        progress = getattr(ctx, "sim_progress", 0.0) if ctx else 0.0
        message = getattr(ctx, "sim_message", "") if ctx else ""
        started = getattr(ctx, "sim_started_at", None) if ctx else None
        elapsed = round(time.time() - started, 1) if started else 0.0
        body = json.dumps(
            {
                "status": "running" if running else "idle",
                "progress": round(progress, 4),
                "message": message,
                "elapsed_s": elapsed,
                "active_sims": len(ctx.simulate_tasks) if ctx else 0,
            }
        ).encode("utf-8")
        return (200, _with_cors([("Content-Type", "application/json")]), body)

    # Only handle /results/... paths.
    if not path_str.startswith("/results/"):
        return None

    # Token check.
    import hmac

    if not hmac.compare_digest(request_token, token):
        return (
            401,
            _with_cors([("Content-Type", "text/plain")]),
            b"401 Unauthorized: missing or invalid token",
        )

    # Parse path segments.
    # Strip leading /results/
    rest = path_str[len("/results/") :]
    segments = rest.split("/")

    if _reject_traversal(segments):
        return (
            400,
            _with_cors([("Content-Type", "text/plain")]),
            b"400 Bad Request: path traversal",
        )

    if len(segments) < 2:
        return (404, _with_cors([("Content-Type", "text/plain")]), b"404 Not Found")

    sim_id = segments[0]
    sim_dir = results_root / sim_id

    if not sim_dir.exists():
        return (404, _with_cors([("Content-Type", "text/plain")]), b"404 Not Found: sim_id")

    # /results/<sim_id>/manifest.json
    if len(segments) == 2 and segments[1] == "manifest.json":
        manifest_path = sim_dir / "manifest.json"
        if not manifest_path.exists():
            return (404, _with_cors([("Content-Type", "text/plain")]), b"404 Not Found: manifest")
        body = manifest_path.read_bytes()
        return (200, _with_cors([("Content-Type", "application/json")]), body)

    # /results/<sim_id>/signals/<file>.npy
    if len(segments) == 3 and segments[1] == "signals" and segments[2].endswith(".npy"):
        key = segments[2][: -len(".npy")]
        signal_bytes = _read_signal_npy_bytes(sim_dir / "data.h5", key)
        if signal_bytes is None:
            return (
                404,
                _with_cors([("Content-Type", "text/plain")]),
                b"404 Not Found: signal file",
            )
        return (
            200,
            _with_cors([("Content-Type", "application/octet-stream")]),
            signal_bytes,
        )

    # /results/<sim_id>/lod
    if len(segments) == 2 and segments[1] == "lod":
        return await _handle_lod(qs, sim_dir)

    return (404, _with_cors([("Content-Type", "text/plain")]), b"404 Not Found")


class SliceServer:
    """Standalone HTTP server for waveform slice serving (used by tests)."""

    def __init__(
        self,
        workdir: pathlib.Path,
        token: str,
        host: str = "127.0.0.1",
        port: int = 0,
    ) -> None:
        self._workdir = pathlib.Path(workdir)
        self._token = token
        self._host = host
        self._port = port
        self._results_root = self._workdir / "results"

    async def start(self) -> None:
        """Start the HTTP server (runs until cancelled)."""
        from aiohttp import web

        async def handler(request: web.Request) -> web.Response:
            path = request.path
            # SliceServer only serves /results/... paths.  Anything else is either
            # a traversal attempt (aiohttp normalizes '..' before delivery) or invalid.
            if not path.startswith("/results/"):
                return web.Response(status=400, text="400 Bad Request: invalid path")
            # Forward the full query string so LOD parameters reach handle_http.
            query_string = str(request.rel_url.query_string)
            path_with_query = f"{path}?{query_string}" if query_string else path
            result = await handle_http(path_with_query, {}, self._results_root, self._token)
            if result is None:
                return web.Response(status=404, text="Not Found")
            status, headers, body = result
            return web.Response(status=status, body=body, headers={k: v for k, v in headers})

        app = web.Application()
        app.router.add_route("GET", "/{path_info:.*}", handler)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, self._host, self._port)
        try:
            await site.start()
            await asyncio.Event().wait()  # Run until cancelled.
        except asyncio.CancelledError:
            pass
        finally:
            await runner.cleanup()
