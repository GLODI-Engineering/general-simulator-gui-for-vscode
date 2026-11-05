"""Parse ngspice raw output (ASCII or binary) into a ResultBundle."""

from __future__ import annotations

import pathlib
from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

from simulator.solvers.protocol import ResultBundle, Signal

# Maps a raw file's "Plotname:" header (lowercased) to our analysis_type
# convention. A netlist that declares more than one top-level analysis card
# (e.g. .ac + .dc + .tran with no .control block gating them) makes ngspice
# auto-run all of them in batch mode, writing one concatenated raw file with
# one plot block per analysis — see _select_plot.
_PLOTNAME_TO_ANALYSIS: dict[str, str] = {
    "transient analysis": "TRAN",
    "ac analysis": "AC",
    "dc transfer characteristic": "DC",
    "operating point": "OP",
    "noise spectral density curves": "NOISE",
}


@dataclass
class _PlotBlock:
    plotname: str
    variable_names: list[str]
    is_complex: bool
    values: np.ndarray  # (n_points, n_variables); complex128 or float64


def parse_ngspice_raw(
    path: pathlib.Path,
    sim_id: str,
    analysis_type: str | None = None,
) -> ResultBundle:
    """Parse an ngspice raw file (ASCII or binary, real- or complex-valued).

    A raw file may contain more than one plot block — this happens whenever
    the netlist declares multiple top-level analysis cards (.ac + .dc + .tran
    with no .control block gating them), which ngspice auto-runs and writes
    as one concatenated file, one plot per analysis. When *analysis_type* is
    given, the plot whose ``Plotname:`` header matches it is selected;
    otherwise (or if no plot matches) the first plot in the file is used,
    matching the historical single-plot behavior.

    AC (and any other complex-domain) analyses write ``Flags: complex`` in a
    plot's header and store each value as 16 bytes (real, then imaginary
    float64) instead of the 8-byte plain float64 real analyses use — see
    ``_iter_plot_blocks``.
    """

    raw_bytes = path.read_bytes()
    if not raw_bytes.strip():
        raise ValueError(f"ngspice raw file is empty: {path}")

    plots = list(_iter_plot_blocks(raw_bytes, path))
    if not plots:
        raise ValueError(f"ngspice raw file has no Values/Binary section: {path}")

    plot = _select_plot(plots, analysis_type)

    # The sweep axis (time/frequency/sweep-parameter) is always effectively
    # real-valued even in a "complex" plot (ngspice stores it with a zero
    # imaginary part) — .real is a no-op for real-dtype arrays.
    time = plot.values[:, 0].real.astype(np.float64)

    signal_dtype = np.complex64 if plot.is_complex else np.float32
    signals = [
        Signal(
            block_id="spice",
            port_id=f"signal_{index}",
            name=name,
            data=plot.values[:, index].astype(signal_dtype),
        )
        for index, name in enumerate(plot.variable_names[1:], start=1)
    ]

    return ResultBundle(
        sim_id=sim_id,
        t=time,
        signals=signals,
        t_start=float(time[0]),
        t_end=float(time[-1]),
        n_points=len(time),
    )


def _select_plot(plots: list[_PlotBlock], analysis_type: str | None) -> _PlotBlock:
    if analysis_type:
        wanted = analysis_type.strip().upper()
        for plot in plots:
            if _PLOTNAME_TO_ANALYSIS.get(plot.plotname.lower()) == wanted:
                return plot
    return plots[0]


def _iter_plot_blocks(raw_bytes: bytes, path: pathlib.Path) -> Iterator[_PlotBlock]:
    """Walk *raw_bytes* yielding one _PlotBlock per plot in file order.

    Each plot's exact payload length is computed from its own header (n_points
    x n_variables x bytes-per-value for binary; up to the next "Title:" for
    ASCII), so this advances precisely to the next plot's header instead of
    scanning blindly — binary float data could in principle contain byte
    sequences that look like a marker.
    """
    pos = 0
    n = len(raw_bytes)
    while pos < n:
        binary_idx = raw_bytes.find(b"Binary:\n", pos)
        values_idx = raw_bytes.find(b"Values:\n", pos)
        if binary_idx == -1 and values_idx == -1:
            return
        if binary_idx != -1 and (values_idx == -1 or binary_idx < values_idx):
            marker_idx, is_binary = binary_idx, True
        else:
            marker_idx, is_binary = values_idx, False

        header_text = raw_bytes[pos:marker_idx].decode("ascii", errors="replace")
        lines = header_text.splitlines()
        n_points = _parse_required_int(lines, "No. Points:")
        variable_names = _parse_variables(lines)
        if not variable_names:
            raise ValueError(f"ngspice raw file has no Variables section: {path}")
        is_complex = _parse_is_complex(lines)
        plotname = _parse_plotname(lines)

        if is_binary:
            data_start = marker_idx + len(b"Binary:\n")
            bytes_per_value = 16 if is_complex else 8
            expected_bytes = len(variable_names) * n_points * bytes_per_value
            payload = raw_bytes[data_start : data_start + expected_bytes]
            if len(payload) < expected_bytes:
                raise NotImplementedError(
                    "ngspice binary raw not yet supported for truncated or synthetic payloads"
                )
            dtype = "<c16" if is_complex else "<f8"
            values = np.frombuffer(payload, dtype=dtype).reshape((n_points, len(variable_names)))
            pos = data_start + expected_bytes
        else:
            data_start = marker_idx + len(b"Values:\n")
            next_title = raw_bytes.find(b"Title:", data_start)
            block_end = next_title if next_title != -1 else n
            values_text = raw_bytes[data_start:block_end].decode("utf-8", errors="replace")
            values = _parse_ascii_values(
                values_text.splitlines(), len(variable_names), n_points, path, is_complex
            )
            pos = block_end

        yield _PlotBlock(
            plotname=plotname,
            variable_names=variable_names,
            is_complex=is_complex,
            values=values,
        )


def _parse_required_int(lines: list[str], prefix: str) -> int:
    for line in lines:
        if line.startswith(prefix):
            return int(line.split(":", 1)[1].strip())
    raise ValueError(f"ngspice raw file is missing header {prefix!r}")


def _parse_plotname(lines: list[str]) -> str:
    for line in lines:
        if line.startswith("Plotname:"):
            return line.split(":", 1)[1].strip()
    return ""


def _parse_is_complex(lines: list[str]) -> bool:
    """True when the header declares ``Flags: complex`` (AC analyses and any
    other complex-domain plot). Defaults to False (real) when absent, since
    older/synthetic fixtures may omit the Flags line entirely.
    """
    for line in lines:
        if line.startswith("Flags:"):
            return "complex" in line.split(":", 1)[1].lower()
    return False


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
            raise ValueError(f"Malformed ngspice variable line: {line!r}")
        names.append(parts[1])
    return names


def _parse_ascii_number(token: str, is_complex: bool) -> complex | float:
    """Parse one ASCII raw value token.

    Real plots write a plain float per value. Complex plots (``Flags:
    complex`` — AC and other frequency-domain analyses) write each value as
    a comma-joined "real,imag" pair with no surrounding whitespace, e.g.
    ``1.234e+03,5.678e-02``.
    """
    if is_complex and "," in token:
        real_part, imag_part = token.split(",", 1)
        return complex(float(real_part), float(imag_part))
    return float(token)


def _parse_ascii_values(
    lines: list[str],
    n_variables: int,
    n_points: int,
    path: pathlib.Path,
    is_complex: bool = False,
) -> np.ndarray:
    rows: list[list[complex | float]] = []
    current_row: list[complex | float] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        parts = stripped.split()
        if len(parts) == 2 and parts[0].isdigit() and not current_row:
            current_row.append(_parse_ascii_number(parts[1], is_complex))
        elif len(parts) == 1:
            current_row.append(_parse_ascii_number(parts[0], is_complex))
        else:
            numeric_parts = parts[1:] if parts[0].isdigit() else parts
            current_row.extend(_parse_ascii_number(part, is_complex) for part in numeric_parts)

        if len(current_row) == n_variables:
            rows.append(current_row)
            current_row = []
        elif len(current_row) > n_variables:
            raise ValueError(f"ngspice raw row has too many values in {path}")

    if current_row:
        raise ValueError(f"ngspice raw file ended mid-row: {path}")

    if len(rows) != n_points:
        raise ValueError(
            f"ngspice raw point count mismatch in {path}: expected {n_points}, got {len(rows)}"
        )

    return np.array(rows, dtype=np.complex128 if is_complex else np.float64)
