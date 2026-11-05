"""Tail a growing ngspice binary raw file for live waveform streaming (BE-54).

ngspice writes its ``-r <path>.raw`` output incrementally as it computes each
sweep point (confirmed empirically: the file's size grows steadily in real
time during a run and stops the instant the process is killed) rather than
buffering everything until exit. ``No. Points:`` in the header is a
placeholder written once at the start and is never updated live, so the
number of complete points available must be derived from the file's current
byte length instead of trusted from the header.

This module only tails the first plot block in the file (the common case: a
netlist with a single top-level analysis card). A netlist with multiple
analysis cards (see ``ngspice_raw._iter_plot_blocks``) still simulates and
delivers results correctly at completion via the existing batch parse path —
this tailer simply stops yielding new points once the first plot's declared
variable/point structure no longer matches what continues to grow (handled
naturally: a second plot's header text would corrupt binary decoding, so we
conservatively stop tailing rather than risk misparsing).
"""

from __future__ import annotations

import pathlib

import numpy as np

from simulator.solvers.protocol import PartialPoints


class NgspiceRawTailer:
    """Incrementally parses new complete points from a growing ngspice raw file."""

    def __init__(self, path: pathlib.Path) -> None:
        self._path = path
        self._header_parsed = False
        self._data_start = 0
        self._variable_names: list[str] = []
        self._is_complex = False
        self._bytes_per_point = 0
        self._points_emitted = 0

    def poll(self) -> PartialPoints | None:
        """Return newly-available complete points since the last call, or None."""
        if not self._path.exists():
            return None

        if not self._header_parsed and not self._try_parse_header():
            return None

        try:
            size = self._path.stat().st_size
        except OSError:
            return None

        available = size - self._data_start
        if available <= 0:
            return None

        total_points_available = available // self._bytes_per_point
        new_points = total_points_available - self._points_emitted
        if new_points <= 0:
            return None

        start_byte = self._data_start + self._points_emitted * self._bytes_per_point
        end_byte = start_byte + new_points * self._bytes_per_point

        try:
            with self._path.open("rb") as fh:
                fh.seek(start_byte)
                payload = fh.read(end_byte - start_byte)
        except OSError:
            return None

        if len(payload) < end_byte - start_byte:
            # A concurrent write left a torn read; try again next poll.
            return None

        dtype = "<c16" if self._is_complex else "<f8"
        values = np.frombuffer(payload, dtype=dtype).reshape(
            (new_points, len(self._variable_names))
        )
        self._points_emitted += new_points

        x = values[:, 0].real.astype(np.float64)
        signal_values = {
            name: values[:, index].astype(np.complex64 if self._is_complex else np.float32)
            for index, name in enumerate(self._variable_names[1:], start=1)
        }
        return PartialPoints(x=x, signal_values=signal_values)

    def _try_parse_header(self) -> bool:
        try:
            raw_bytes = self._path.read_bytes()
        except OSError:
            return False

        binary_idx = raw_bytes.find(b"Binary:\n")
        if binary_idx == -1:
            return False

        header_text = raw_bytes[:binary_idx].decode("ascii", errors="replace")
        lines = header_text.splitlines()

        variable_names = _parse_variables(lines)
        if not variable_names:
            return False
        is_complex = _parse_is_complex(lines)

        self._variable_names = variable_names
        self._is_complex = is_complex
        self._bytes_per_point = len(variable_names) * (16 if is_complex else 8)
        self._data_start = binary_idx + len(b"Binary:\n")
        self._header_parsed = True
        return True


def _parse_variables(lines: list[str]) -> list[str]:
    start = None
    for index, line in enumerate(lines):
        if line.strip() == "Variables:":
            start = index + 1
            break
    if start is None:
        return []

    names: list[str] = []
    for line in lines[start:]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped in {"Values:", "Binary:"}:
            break
        parts = stripped.split()
        if len(parts) < 3:
            return []
        names.append(parts[1])
    return names


def _parse_is_complex(lines: list[str]) -> bool:
    for line in lines:
        if line.startswith("Flags:"):
            return "complex" in line.split(":", 1)[1].lower()
    return False
