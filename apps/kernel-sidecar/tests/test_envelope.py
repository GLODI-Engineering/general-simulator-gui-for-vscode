"""BE-02 — Envelope round-trip tests.

Validates that Message.to_json() / Message.from_json() round-trips correctly
for every MessageType defined in the IPC envelope.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from kernel_sidecar.ipc.envelope import (
    Message,
    MessageType,
    decode_waveform_chunk_frame,
    encode_waveform_chunk_frame,
)

ALL_TYPES = list(MessageType)


# ---------------------------------------------------------------------------
# Round-trip for every message type
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("msg_type", ALL_TYPES, ids=lambda t: t.value)
def test_round_trip(msg_type: MessageType) -> None:
    """to_json → from_json must return an equivalent Message."""
    original = Message(id="test-id-123", type=msg_type, payload={"key": "value"})
    serialized = original.to_json()
    recovered = Message.from_json(serialized)

    assert recovered.id == original.id
    assert recovered.type == original.type
    assert recovered.payload == original.payload


@pytest.mark.parametrize("msg_type", ALL_TYPES, ids=lambda t: t.value)
def test_serialized_is_valid_json(msg_type: MessageType) -> None:
    """to_json must produce valid JSON for every type."""
    msg = Message(id="x", type=msg_type, payload={})
    raw = msg.to_json()
    parsed = json.loads(raw)
    assert parsed["id"] == "x"
    assert parsed["type"] == msg_type.value


def test_payload_preserved_complex() -> None:
    """Nested payload structures must survive round-trip."""
    payload = {
        "code": "x = [1, 2, 3]",
        "nested": {"a": True, "b": None, "c": [1.0, 2.0]},
    }
    msg = Message(id="abc", type=MessageType.EXECUTE, payload=payload)
    recovered = Message.from_json(msg.to_json())
    assert recovered.payload == payload


def test_empty_payload_round_trip() -> None:
    msg = Message(id="empty", type=MessageType.KERNEL_RESTART, payload={})
    recovered = Message.from_json(msg.to_json())
    assert recovered.payload == {}


def test_from_json_missing_payload_defaults_to_empty() -> None:
    """A raw JSON string without 'payload' key must produce payload={}."""
    raw = json.dumps({"id": "x", "type": "handshake"})
    msg = Message.from_json(raw)
    assert msg.payload == {}


def test_message_is_frozen() -> None:
    """Message is frozen; mutation must raise."""
    msg = Message(id="x", type=MessageType.EXECUTE, payload={})
    with pytest.raises((AttributeError, TypeError)):
        msg.id = "changed"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# MessageType values match the IPC spec literals
# ---------------------------------------------------------------------------

FRONTEND_TO_KERNEL = {
    "handshake",
    "execute",
    "execute_cancel",
    "workspace_get",
    "kernel_restart",
    "completion_request",
    "simulate",
    "simulate_cancel",
}

KERNEL_TO_FRONTEND = {
    "execute_result",
    "execute_stream",
    "execute_error",
    "workspace_update",
    "workspace_value",
    "plot_ready",
    "completion_reply",
    "kernel_status",
    "simulate_progress",
    "simulate_result",
}


def test_all_frontend_to_kernel_types_exist() -> None:
    values = {t.value for t in MessageType}
    assert values >= FRONTEND_TO_KERNEL, (
        f"Missing frontend→kernel types: {FRONTEND_TO_KERNEL - values}"
    )


def test_all_kernel_to_frontend_types_exist() -> None:
    values = {t.value for t in MessageType}
    assert values >= KERNEL_TO_FRONTEND, (
        f"Missing kernel→frontend types: {KERNEL_TO_FRONTEND - values}"
    )


# ---------------------------------------------------------------------------
# BE-56 — binary waveform_chunk frame round-trip
# ---------------------------------------------------------------------------


def test_waveform_chunk_frame_round_trip() -> None:
    x = np.linspace(0.0, 1e-3, 500, dtype=np.float64)
    values = np.sin(x * 1e4).astype(np.float32)

    frame = encode_waveform_chunk_frame("req-1", "v(out)", x, values)
    header, x_out, values_out = decode_waveform_chunk_frame(frame)

    assert header["type"] == "waveform_chunk"
    assert header["sim_id"] == "req-1"
    assert header["signal_id"] == "v(out)"
    assert header["n"] == 500
    np.testing.assert_allclose(x_out, x)
    np.testing.assert_allclose(values_out, values, rtol=1e-6)


def test_waveform_chunk_frame_is_compact_binary_not_json_text() -> None:
    """Guards against regressing back to verbose JSON float encoding (BE-56)."""
    n = 1000
    x = np.linspace(0.0, 1.0, n, dtype=np.float64)
    values = np.random.rand(n).astype(np.float32)

    frame = encode_waveform_chunk_frame("req-1", "sig", x, values)

    # 128-byte header + 8 bytes/point (x) + 4 bytes/point (values), exactly —
    # no per-value ASCII float-text bloat.
    assert len(frame) == 128 + n * 8 + n * 4


def test_waveform_chunk_frame_rejects_signal_id_too_long_for_header() -> None:
    x = np.array([0.0])
    values = np.array([0.0], dtype=np.float32)
    with pytest.raises(ValueError, match="header too large"):
        encode_waveform_chunk_frame("req-1", "x" * 200, x, values)


def test_waveform_chunk_frame_empty_arrays() -> None:
    x = np.array([], dtype=np.float64)
    values = np.array([], dtype=np.float32)
    frame = encode_waveform_chunk_frame("req-1", "sig", x, values)
    header, x_out, values_out = decode_waveform_chunk_frame(frame)
    assert header["n"] == 0
    assert len(x_out) == 0
    assert len(values_out) == 0
