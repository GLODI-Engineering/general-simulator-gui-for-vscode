"""Parse Xyce PRN output into a ResultBundle."""

from __future__ import annotations

import pathlib

import numpy as np

from simulator.solvers.protocol import ResultBundle, Signal


def parse_xyce_prn(path: pathlib.Path, sim_id: str) -> ResultBundle:
    """Parse a whitespace-delimited Xyce .prn file."""

    text = path.read_text(encoding="utf-8")
    if not text.strip():
        raise ValueError(f"Xyce PRN file is empty: {path}")

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        raise ValueError(f"Xyce PRN file is empty: {path}")

    header_index = None
    for index, line in enumerate(lines):
        tokens = line.split()
        if len(tokens) >= 2 and tokens[0].upper() in {"TIME", "FREQ"}:
            header_index = index
            break
        if (
            len(tokens) >= 3
            and tokens[0].upper() == "INDEX"
            and tokens[1].upper() in {"TIME", "FREQ"}
        ):
            header_index = index
            break

    if header_index is None:
        raise ValueError(f"Xyce PRN header must start with TIME or FREQ: {path}")

    header = lines[header_index].split()
    if len(header) < 2:
        raise ValueError(f"Xyce PRN header must include a time or frequency column: {path}")

    data_offset = 0
    axis_name = header[0].upper()
    if axis_name == "INDEX" and len(header) >= 3:
        data_offset = 1
        axis_name = header[1].upper()
    if axis_name not in {"TIME", "FREQ"}:
        raise ValueError(f"Xyce PRN header must start with TIME or FREQ: {path}")

    signal_header = header[data_offset + 1 :]

    rows: list[list[float]] = []
    for line in lines[header_index + 1 :]:
        parts = line.split()
        if len(parts) != len(header):
            if rows:
                break
            continue
        numeric_parts = parts[data_offset:]
        try:
            rows.append([float(part) for part in numeric_parts])
        except ValueError:
            if rows:
                break
            continue

    if not rows:
        raise ValueError(f"Xyce PRN file has no data rows: {path}")

    values = np.array(rows, dtype=np.float64)
    time = values[:, 0].astype(np.float64)
    signals = [
        Signal(
            block_id="spice",
            port_id=f"signal_{index}",
            name=name,
            data=values[:, index].astype(np.float32),
        )
        for index, name in enumerate(signal_header, start=1)
    ]

    return ResultBundle(
        sim_id=sim_id,
        t=time,
        signals=signals,
        t_start=float(time[0]),
        t_end=float(time[-1]),
        n_points=len(time),
    )
