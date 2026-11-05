"""BE-54 — NgspiceRawTailer unit tests.

Simulates ngspice's incremental raw-file writing (confirmed empirically: the
binary raw file grows in real time as points are computed, with a
placeholder "No. Points: 0" header that is never updated live) by appending
bytes to a file between poll() calls.
"""

from __future__ import annotations

import pathlib
import struct

from simulator.parsers.spice.ngspice_raw_tail import NgspiceRawTailer

_HEADER_REAL = """Title: streaming test
Date: today
Plotname: Transient Analysis
Flags: real
No. Variables: 2
No. Points: 0
Variables:
\t0\ttime\ttime
\t1\tv(out)\tvoltage
Binary:
"""

_HEADER_COMPLEX = """Title: streaming ac test
Date: today
Plotname: AC Analysis
Flags: complex
No. Variables: 2
No. Points: 0
Variables:
\t0\tfrequency\tfrequency
\t1\tv(out)\tvoltage
Binary:
"""


def _real_point(t: float, v: float) -> bytes:
    return struct.pack("<dd", t, v)


def _complex_point(f: float, real: float, imag: float) -> bytes:
    return struct.pack("<dddd", f, 0.0, real, imag)


def test_poll_returns_none_before_file_exists(tmp_path: pathlib.Path) -> None:
    tailer = NgspiceRawTailer(tmp_path / "missing.raw")
    assert tailer.poll() is None


def test_poll_returns_none_until_header_and_a_full_point_are_written(
    tmp_path: pathlib.Path,
) -> None:
    path = tmp_path / "out.raw"
    tailer = NgspiceRawTailer(path)

    path.write_bytes(_HEADER_REAL.encode("ascii"))
    assert tailer.poll() is None  # header present, but zero complete points

    with path.open("ab") as fh:
        fh.write(_real_point(0.0, 0.0)[:8])  # a torn/partial point
    assert tailer.poll() is None


def test_poll_yields_new_real_points_as_the_file_grows(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "out.raw"
    tailer = NgspiceRawTailer(path)
    path.write_bytes(_HEADER_REAL.encode("ascii"))

    with path.open("ab") as fh:
        fh.write(_real_point(0.0, 0.0))
        fh.write(_real_point(1e-6, 0.5))

    first = tailer.poll()
    assert first is not None
    assert list(first.x) == [0.0, 1e-6]
    assert list(first.signal_values["v(out)"]) == [0.0, 0.5]

    # Nothing new yet.
    assert tailer.poll() is None

    with path.open("ab") as fh:
        fh.write(_real_point(2e-6, 1.0))

    second = tailer.poll()
    assert second is not None
    assert list(second.x) == [2e-6]
    assert list(second.signal_values["v(out)"]) == [1.0]


def test_poll_decodes_complex_ac_points(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "ac.raw"
    tailer = NgspiceRawTailer(path)
    path.write_bytes(_HEADER_COMPLEX.encode("ascii"))

    with path.open("ab") as fh:
        fh.write(_complex_point(1e3, 3.0, 4.0))

    partial = tailer.poll()
    assert partial is not None
    value = partial.signal_values["v(out)"][0]
    assert abs(value.real - 3.0) < 1e-6
    assert abs(value.imag - 4.0) < 1e-6


def test_poll_never_double_emits_a_point(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "out.raw"
    tailer = NgspiceRawTailer(path)
    path.write_bytes(_HEADER_REAL.encode("ascii"))

    with path.open("ab") as fh:
        fh.write(_real_point(0.0, 1.0))
    first = tailer.poll()
    assert first is not None and len(first.x) == 1

    with path.open("ab") as fh:
        fh.write(_real_point(1e-6, 2.0))
        fh.write(_real_point(2e-6, 3.0))
    second = tailer.poll()
    assert second is not None
    assert list(second.x) == [1e-6, 2e-6]
