"""Tail a growing Xyce .prn file for live waveform streaming (BE-54).

Xyce's ``.prn`` output is ASCII, one whitespace-delimited row per computed
point, flushed incrementally during the run (confirmed empirically: the file
grows steadily in real time while Xyce runs). This tailer reads only whole
new lines, buffering a trailing partial line until it is completed by a
subsequent poll, mirroring ``xyce_prn.parse_xyce_prn``'s header/column
conventions so live and final signal names match exactly.
"""

from __future__ import annotations

import pathlib

import numpy as np

from simulator.solvers.protocol import PartialPoints


class XycePrnTailer:
    """Incrementally parses new complete data rows from a growing Xyce .prn file."""

    def __init__(self, path: pathlib.Path) -> None:
        self._path = path
        self._header_parsed = False
        self._signal_names: list[str] = []
        self._data_offset = 0
        self._expected_columns = 0
        self._read_pos = 0
        self._buffer = ""

    def poll(self) -> PartialPoints | None:
        if not self._path.exists():
            return None

        try:
            with self._path.open("r", encoding="utf-8", errors="replace") as fh:
                fh.seek(self._read_pos)
                chunk = fh.read()
                self._read_pos = fh.tell()
        except OSError:
            return None

        if not chunk:
            return None

        self._buffer += chunk
        lines = self._buffer.split("\n")
        # The last element is either an empty string (buffer ended on a
        # newline) or a partial line to keep for the next poll.
        self._buffer = lines[-1]
        complete_lines = lines[:-1]
        if not complete_lines:
            return None

        if not self._header_parsed and not self._try_parse_header(complete_lines):
            return None

        rows: list[list[float]] = []
        for line in complete_lines:
            stripped = line.strip()
            if not stripped:
                continue
            parts = stripped.split()
            if len(parts) != self._expected_columns:
                continue
            numeric_parts = parts[self._data_offset :]
            try:
                rows.append([float(part) for part in numeric_parts])
            except ValueError:
                continue

        if not rows:
            return None

        values = np.array(rows, dtype=np.float64)
        x = values[:, 0]
        signal_values = {
            name: values[:, index].astype(np.float32)
            for index, name in enumerate(self._signal_names, start=1)
        }
        return PartialPoints(x=x, signal_values=signal_values)

    def _try_parse_header(self, complete_lines: list[str]) -> bool:
        for index, line in enumerate(complete_lines):
            tokens = line.strip().split()
            if len(tokens) >= 2 and tokens[0].upper() in {"TIME", "FREQ"}:
                header_tokens = tokens
                data_offset = 0
            elif (
                len(tokens) >= 3
                and tokens[0].upper() == "INDEX"
                and tokens[1].upper() in {"TIME", "FREQ"}
            ):
                header_tokens = tokens
                data_offset = 1
            else:
                continue

            self._signal_names = header_tokens[data_offset + 1 :]
            self._data_offset = data_offset
            self._expected_columns = len(header_tokens)
            self._header_parsed = True
            # Discard the header line and everything before it — only rows
            # after this point are data.
            del complete_lines[: index + 1]
            return True
        return False
