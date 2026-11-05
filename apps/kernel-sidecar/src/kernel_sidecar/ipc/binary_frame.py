"""Binary WebSocket frame encoder for ndarray payloads (BE-09).

Frame layout: 128-byte JSON header (padded with spaces) + raw array bytes.
The header contains: {id, dtype, shape}.
"""

from __future__ import annotations

import json

import numpy as np

HEADER_SIZE = 128


def encode_binary_frame(request_id: str, arr: np.ndarray) -> bytes:
    """Encode a numpy array as a binary WebSocket frame.

    Returns bytes: 128-byte JSON header + arr.tobytes().
    """
    header_dict = {
        "id": request_id,
        "dtype": str(arr.dtype),
        "shape": list(arr.shape),
    }
    header_str = json.dumps(header_dict)
    if len(header_str) > HEADER_SIZE:
        raise ValueError(f"Binary frame header too large ({len(header_str)} > {HEADER_SIZE} bytes)")
    # Pad to exactly HEADER_SIZE bytes with spaces.
    header_bytes = header_str.encode("ascii").ljust(HEADER_SIZE, b" ")
    return header_bytes + arr.tobytes()


def decode_binary_frame(data: bytes) -> tuple[dict, np.ndarray]:
    """Decode a binary frame back into (header_dict, ndarray)."""
    if len(data) < HEADER_SIZE:
        raise ValueError("Binary frame too short")
    header_bytes = data[:HEADER_SIZE]
    header_dict = json.loads(header_bytes.decode("ascii").strip())
    dtype = np.dtype(header_dict["dtype"])
    shape = tuple(header_dict["shape"])
    raw = data[HEADER_SIZE:]
    arr = np.frombuffer(raw, dtype=dtype).reshape(shape)
    return header_dict, arr


def encode_array(arr: np.ndarray, request_id: str = "") -> bytes:
    """Alias for encode_binary_frame with array-first argument order."""
    return encode_binary_frame(request_id, arr)


def decode_array(data: bytes) -> np.ndarray:
    """Decode a binary frame and return just the ndarray."""
    _, arr = decode_binary_frame(data)
    return arr
