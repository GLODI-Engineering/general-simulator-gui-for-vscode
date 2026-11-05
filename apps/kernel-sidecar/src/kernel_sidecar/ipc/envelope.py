"""JSON message envelope dataclasses matching frontend-spec.md §15.2.

Every IPC message has the shape:
    {id: str, type: str, payload: dict}

Message types are listed in MessageType below.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import numpy as np


class MessageType(StrEnum):
    # Frontend → Kernel
    HANDSHAKE = "handshake"
    EXECUTE = "execute"
    EXECUTE_CANCEL = "execute_cancel"
    WORKSPACE_GET = "workspace_get"
    KERNEL_RESTART = "kernel_restart"
    COMPLETION_REQUEST = "completion_request"
    SIMULATE = "simulate"
    SIMULATE_CANCEL = "simulate_cancel"

    # Kernel → Frontend
    EXECUTE_RESULT = "execute_result"
    EXECUTE_STREAM = "execute_stream"
    EXECUTE_ERROR = "execute_error"
    WORKSPACE_UPDATE = "workspace_update"
    WORKSPACE_VALUE = "workspace_value"
    PLOT_READY = "plot_ready"
    COMPLETION_REPLY = "completion_reply"
    KERNEL_STATUS = "kernel_status"
    SIMULATE_PROGRESS = "simulate_progress"
    SIMULATE_RESULT = "simulate_result"
    WAVEFORM_CHUNK = "waveform_chunk"
    WAVEFORM_DONE = "waveform_done"


@dataclass(frozen=True)
class Message:
    id: str
    type: str
    payload: Any

    def to_json(self) -> str:
        return json.dumps({"id": self.id, "type": self.type, "payload": self.payload})

    @classmethod
    def from_json(cls, raw: str) -> Message:
        data = json.loads(raw)
        return cls(
            id=data["id"],
            type=data["type"],
            payload=data.get("payload", {}),
        )


@dataclass(frozen=True)
class WaveformChunk:
    """A partial waveform payload streamed during a transient solve (BE-49).

    One chunk covers a contiguous time window [t_start, t_end] of one signal.
    values is a flat list of float32 samples for that window. x (BE-54) is
    the exact per-point sweep-axis value (time/frequency/parameter) for each
    entry in values — needed because SPICE solvers use non-uniform step
    sizes, so t_start/t_end alone can't reconstruct per-point x positions.
    Defaults to an empty list for older callers that only send the window
    bounds.
    """

    signal_id: str
    t_start: float
    t_end: float
    values: list[float]
    x: list[float] = field(default_factory=list)


_CHUNK_FRAME_HEADER_SIZE = 128


def encode_waveform_chunk_frame(
    sim_id: str, signal_id: str, x: np.ndarray, values: np.ndarray
) -> bytes:
    """Binary-encode a WAVEFORM_CHUNK payload (BE-56 performance fix).

    Frame layout: 128-byte JSON header (padded with spaces) + x bytes
    (float64, 8 bytes/point) + values bytes (float32, 4 bytes/point).

    Replaces the JSON-encoded payload used through BE-54. Profiling a real
    live-streaming run (cProfile against the actual _do_simulate code path)
    showed json.encoder.iterencode was the single largest cost — 61% of
    wall time for one representative run — because every point was first
    converted to a Python float via a list comprehension and then
    ASCII-encoded as JSON float text (15-25 bytes/value) instead of raw
    IEEE754 bytes (4-8 bytes/value). That run also sent 476 MB of JSON text
    for a single 20 ms/162k-point/77-signal simulation; the full 100 ms
    netlist would have sent on the order of 2+ GB, which is what actually
    drove the 305 s observed end-to-end (JSON encode cost on the server,
    plus the browser having to receive and JSON.parse that volume). Binary
    encoding cuts both the CPU cost (no per-element float() conversion, no
    text formatting) and the wire size (roughly 3-5x smaller) at the source.

    *sim_id* must match the ResultBundle's sim_id (the same value fetchSignal
    uses to key its cache as f"{sim_id}::{signal_name}") — it is NOT always
    the WebSocket request_id: the SciPy backend path assigns its own fresh
    sim_id independent of request_id, while the direct-netlist SPICE path
    (the only one that streams live today) happens to use request_id as
    sim_id. Passing the wrong id silently caches live chunks under a key
    addSignalToAxes never looks up, so nothing renders (found while wiring
    up the frontend's binary decode path — the frontend previously dropped
    all binary WebSocket frames outright, so this mismatch had no observable
    effect before now).
    """
    x64 = np.asarray(x, dtype="<f8")
    v32 = np.asarray(values, dtype="<f4")
    header_dict = {
        "type": "waveform_chunk",
        "sim_id": sim_id,
        "signal_id": signal_id,
        "n": len(x64),
    }
    header_bytes = json.dumps(header_dict).encode("utf-8")
    if len(header_bytes) > _CHUNK_FRAME_HEADER_SIZE:
        raise ValueError(
            f"waveform_chunk frame header too large ({len(header_bytes)} > "
            f"{_CHUNK_FRAME_HEADER_SIZE} bytes) for signal_id={signal_id!r}"
        )
    header_bytes = header_bytes.ljust(_CHUNK_FRAME_HEADER_SIZE, b" ")
    return header_bytes + x64.tobytes() + v32.tobytes()


def decode_waveform_chunk_frame(frame: bytes) -> tuple[dict[str, Any], np.ndarray, np.ndarray]:
    """Decode a frame produced by encode_waveform_chunk_frame back into (header, x, values)."""
    if len(frame) < _CHUNK_FRAME_HEADER_SIZE:
        raise ValueError("waveform_chunk frame too short")
    header = json.loads(frame[:_CHUNK_FRAME_HEADER_SIZE].decode("utf-8").strip())
    n = header["n"]
    body = frame[_CHUNK_FRAME_HEADER_SIZE:]
    x = np.frombuffer(body[: n * 8], dtype="<f8")
    values = np.frombuffer(body[n * 8 : n * 8 + n * 4], dtype="<f4")
    return header, x, values


@dataclass(frozen=True)
class WaveformDone:
    """Signals that all chunks for one signal have been sent (BE-49).

    manifest_entry mirrors a single signal entry from the BE-47 manifest
    (keys: name, block_id, port_id, analysis, quantity, unit, domain, dtype,
    shape, url; optionally swept_param).
    """

    signal_id: str
    manifest_entry: dict[str, object]
