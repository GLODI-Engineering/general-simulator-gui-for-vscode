"""BE-54 — XycePrnTailer unit tests.

Simulates Xyce's incremental ASCII .prn writing (confirmed empirically: the
file grows in real time, line by line, as points are computed) by appending
text to a file between poll() calls.
"""

from __future__ import annotations

import pathlib

from simulator.parsers.spice.xyce_prn_tail import XycePrnTailer


def test_poll_returns_none_before_file_exists(tmp_path: pathlib.Path) -> None:
    tailer = XycePrnTailer(tmp_path / "missing.prn")
    assert tailer.poll() is None


def test_poll_returns_none_until_header_and_one_row_are_written(
    tmp_path: pathlib.Path,
) -> None:
    path = tmp_path / "out.prn"
    tailer = XycePrnTailer(path)

    path.write_text("Index   TIME            V(OUT)\n")
    assert tailer.poll() is None

    with path.open("a") as fh:
        fh.write("0   0.000000e+00")  # partial line, no trailing newline
    assert tailer.poll() is None


def test_poll_yields_new_rows_as_the_file_grows(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "out.prn"
    tailer = XycePrnTailer(path)
    path.write_text("Index   TIME            V(OUT)\n")

    with path.open("a") as fh:
        fh.write("0   0.000000e+00    0.000000e+00\n")
        fh.write("1   1.000000e-06    5.000000e-01\n")

    first = tailer.poll()
    assert first is not None
    assert list(first.x) == [0.0, 1e-6]
    assert list(first.signal_values["V(OUT)"]) == [0.0, 0.5]

    assert tailer.poll() is None

    with path.open("a") as fh:
        fh.write("2   2.000000e-06    1.000000e+00\n")

    second = tailer.poll()
    assert second is not None
    assert list(second.x) == [2e-6]
    assert list(second.signal_values["V(OUT)"]) == [1.0]


def test_poll_handles_header_without_index_column(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "out.prn"
    tailer = XycePrnTailer(path)
    path.write_text("TIME            V(OUT)\n")

    with path.open("a") as fh:
        fh.write("0.000000e+00    0.000000e+00\n")

    partial = tailer.poll()
    assert partial is not None
    assert list(partial.x) == [0.0]
    assert list(partial.signal_values["V(OUT)"]) == [0.0]


def test_poll_never_double_emits_a_row(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "out.prn"
    tailer = XycePrnTailer(path)
    path.write_text("Index   TIME            V(OUT)\n")

    with path.open("a") as fh:
        fh.write("0   0.000000e+00    1.000000e+00\n")
    first = tailer.poll()
    assert first is not None and len(first.x) == 1

    with path.open("a") as fh:
        fh.write("1   1.000000e-06    2.000000e+00\n")
        fh.write("2   2.000000e-06    3.000000e+00\n")
    second = tailer.poll()
    assert second is not None
    assert list(second.x) == [1e-6, 2e-6]
