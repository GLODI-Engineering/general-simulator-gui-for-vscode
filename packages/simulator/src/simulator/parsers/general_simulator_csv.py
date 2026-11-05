"""Parse `general-simulator`'s own CSV output into a `ResultBundle`.

`general-simulator --format csv` (the default; see `book/user-guide/src/cli-reference.md` in
the `general-simulator` repo) prints one header row (`t,V(node1),...,I(branch1),...,<block
name>,...`) then one row per resolved timestep. Every column after `t` is a signal — a circuit
quantity (`V(...)`/`I(...)`, same naming convention ngspice's own raw-file variable names use,
which is why `simulator.postprocess.result_writer.infer_signal_meta` already recognizes it
unchanged) or a bare block name for a signal-domain block's own output.
"""

from __future__ import annotations

import csv
import io
import pathlib

import numpy as np

from simulator.solvers.protocol import ResultBundle, Signal


def parse_general_simulator_csv(path: pathlib.Path, sim_id: str) -> ResultBundle:
    """Parse a CSV file written by `general-simulator --format csv > path`."""
    text = path.read_text(encoding="utf-8")
    return parse_general_simulator_csv_text(text, sim_id)


def parse_general_simulator_csv_text(text: str, sim_id: str) -> ResultBundle:
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration as exc:
        raise ValueError("general-simulator CSV output is empty (no header row).") from exc
    if not header or header[0] != "t":
        raise ValueError(f"general-simulator CSV output has no leading 't' column: {header!r}")

    signal_names = header[1:]
    rows: list[list[float]] = [[float(cell) for cell in row] for row in reader if row]
    if not rows:
        raise ValueError("general-simulator CSV output has a header but no data rows.")

    data = np.array(rows, dtype=np.float64)  # (n_points, 1 + n_signals)
    time = data[:, 0]
    signals = [
        Signal(
            block_id="general_simulator",
            port_id=f"signal_{index}",
            name=name,
            data=data[:, index].astype(np.float32),
        )
        for index, name in enumerate(signal_names, start=1)
    ]

    return ResultBundle(
        sim_id=sim_id,
        t=time,
        signals=signals,
        t_start=float(time[0]),
        t_end=float(time[-1]),
        n_points=len(time),
    )
