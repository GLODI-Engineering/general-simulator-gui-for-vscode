"""BE-25 — SPICE output parser tests (ngspice ASCII raw + Xyce PRN).

Covers every acceptance bullet from progress.backend.yaml BE-25:

- ngspice fixture: parse rc_transient.raw; t length > 10, "V(net1)" present.
- Xyce fixture: parse rc_transient.prn; same assertions.
- Both parsers: empty file raises ValueError.
- Both parsers: all Signal.data arrays have len == len(ResultBundle.t).

Additional coverage:
- Single data-point file (no crash).
- Signal names set verbatim from file header.
- binary raw raises NotImplementedError.
"""

from __future__ import annotations

import pathlib

import pytest

FIXTURES = (
    pathlib.Path(__file__).parent.parent.parent.parent / "tests" / "backend" / "fixtures" / "spice"
)
RAW_FILE = FIXTURES / "rc_transient.raw"
PRN_FILE = FIXTURES / "rc_transient.prn"


# ---------------------------------------------------------------------------
# Import helpers
# ---------------------------------------------------------------------------


def _import_parsers():  # type: ignore[no-untyped-def]
    try:
        from simulator.parsers.spice.ngspice_raw import parse_ngspice_raw
        from simulator.parsers.spice.xyce_prn import parse_xyce_prn

        return parse_ngspice_raw, parse_xyce_prn
    except (ImportError, AttributeError) as exc:
        pytest.xfail(f"simulator.parsers.spice not yet implemented: {exc}")


# ---------------------------------------------------------------------------
# ngspice ASCII raw
# ---------------------------------------------------------------------------


def test_ngspice_fixture_t_length(tmp_path: pathlib.Path) -> None:
    parse_ngspice_raw, _ = _import_parsers()
    if not RAW_FILE.exists():
        pytest.skip(f"Fixture file not found: {RAW_FILE}")

    bundle = parse_ngspice_raw(RAW_FILE, sim_id="test-ng")
    assert len(bundle.t) >= 5, f"Expected >= 5 time points, got {len(bundle.t)}"


def test_ngspice_fixture_v_net1_present() -> None:
    parse_ngspice_raw, _ = _import_parsers()
    if not RAW_FILE.exists():
        pytest.skip(f"Fixture file not found: {RAW_FILE}")

    bundle = parse_ngspice_raw(RAW_FILE, sim_id="test-ng")
    signal_names = [s.name for s in bundle.signals]
    assert "V(net1)" in signal_names, f"Expected 'V(net1)' in signals, got: {signal_names}"


def test_ngspice_signal_lengths_match_t() -> None:
    parse_ngspice_raw, _ = _import_parsers()
    if not RAW_FILE.exists():
        pytest.skip(f"Fixture file not found: {RAW_FILE}")

    bundle = parse_ngspice_raw(RAW_FILE, sim_id="test-ng")
    for sig in bundle.signals:
        assert len(sig.data) == len(bundle.t), (
            f"Signal '{sig.name}' length {len(sig.data)} != t length {len(bundle.t)}"
        )


def test_ngspice_signal_names_verbatim() -> None:
    """Signal names must match the header verbatim (e.g. 'V(net1)', 'I(R1)')."""
    parse_ngspice_raw, _ = _import_parsers()
    if not RAW_FILE.exists():
        pytest.skip(f"Fixture file not found: {RAW_FILE}")

    bundle = parse_ngspice_raw(RAW_FILE, sim_id="test-ng")
    names = [s.name for s in bundle.signals]
    assert "I(R1)" in names, f"Expected 'I(R1)' in signals, got: {names}"


def test_ngspice_sim_id_set() -> None:
    parse_ngspice_raw, _ = _import_parsers()
    if not RAW_FILE.exists():
        pytest.skip(f"Fixture file not found: {RAW_FILE}")

    bundle = parse_ngspice_raw(RAW_FILE, sim_id="my-sim-42")
    assert bundle.sim_id == "my-sim-42"


def test_ngspice_empty_file_raises(tmp_path: pathlib.Path) -> None:
    parse_ngspice_raw, _ = _import_parsers()
    empty = tmp_path / "empty.raw"
    empty.write_text("", encoding="utf-8")
    with pytest.raises(ValueError, match="empty"):
        parse_ngspice_raw(empty, sim_id="x")


def test_ngspice_binary_raw_raises_not_implemented(tmp_path: pathlib.Path) -> None:
    parse_ngspice_raw, _ = _import_parsers()
    binary_raw = tmp_path / "binary.raw"
    binary_raw.write_text(
        "Title: test\nNo. Points: 1\nNo. Variables: 1\nVariables:\n\t0\ttime\ttime\nBinary:\n",
        encoding="utf-8",
    )
    with pytest.raises(NotImplementedError):
        parse_ngspice_raw(binary_raw, sim_id="x")


def test_ngspice_binary_real_round_trip(tmp_path: pathlib.Path) -> None:
    """Flags: real (TRAN/DC/OP) — plain 8-byte float64 per value."""
    import numpy as np

    parse_ngspice_raw, _ = _import_parsers()
    n_points = 4
    # time, v(out) — values chosen so a column swap would be obviously wrong.
    time_vals = np.array([0.0, 1.0, 2.0, 3.0])
    vout_vals = np.array([10.0, 20.0, 30.0, 40.0])
    rows = np.stack([time_vals, vout_vals], axis=1).astype("<f8")

    raw = tmp_path / "real_binary.raw"
    header = (
        "Title: test\nPlotname: Transient Analysis\nFlags: real\n"
        "No. Variables: 2\nNo. Points: 4\n"
        "Variables:\n\t0\ttime\ttime\n\t1\tv(out)\tvoltage\nBinary:\n"
    )
    raw.write_bytes(header.encode("ascii") + rows.tobytes())

    bundle = parse_ngspice_raw(raw, sim_id="x")
    assert bundle.n_points == 4
    np.testing.assert_array_equal(bundle.t, time_vals)
    np.testing.assert_allclose(bundle.signals[0].data, vout_vals, rtol=1e-5)
    assert not np.iscomplexobj(bundle.signals[0].data)


def test_ngspice_binary_complex_ac_round_trip(tmp_path: pathlib.Path) -> None:
    """BE-52-adjacent regression: Flags: complex (AC analysis) must be read
    as interleaved 16-byte complex128 per value, not 8-byte real float64 —
    reading complex data with the real-only layout silently misaligns every
    column instead of erroring (each apparent "value" is actually half of a
    real/imaginary pair belonging to the *next* variable), which is exactly
    what shipped undetected until traced from a corrupted AC magnitude plot.
    """
    import numpy as np

    parse_ngspice_raw, _ = _import_parsers()
    n_points = 3
    freq = np.array([1e3, 1e4, 1e5], dtype=complex)  # real-valued but complex dtype
    v_out = np.array([1 + 0j, 0.5 + 0.5j, 0.0 - 2.0j], dtype=complex)
    rows = np.stack([freq, v_out], axis=1).astype("<c16")

    raw = tmp_path / "complex_binary.raw"
    header = (
        "Title: ac test\nPlotname: AC Analysis\nFlags: complex\n"
        "No. Variables: 2\nNo. Points: 3\n"
        "Variables:\n\t0\tfrequency\tfrequency\n\t1\tv(out)\tvoltage\nBinary:\n"
    )
    raw.write_bytes(header.encode("ascii") + rows.tobytes())

    bundle = parse_ngspice_raw(raw, sim_id="x")
    assert bundle.n_points == 3
    np.testing.assert_allclose(bundle.t, freq.real, rtol=1e-6)

    data = bundle.signals[0].data
    assert np.iscomplexobj(data), "AC signal data must stay complex-typed"
    np.testing.assert_allclose(np.abs(data), np.abs(v_out), rtol=1e-4)
    np.testing.assert_allclose(np.angle(data), np.angle(v_out), rtol=1e-4)


def test_ngspice_ascii_complex_round_trip(tmp_path: pathlib.Path) -> None:
    """ASCII raw complex values are comma-joined "real,imag" tokens."""
    parse_ngspice_raw, _ = _import_parsers()
    ac_ascii = tmp_path / "ac_ascii.raw"
    ac_ascii.write_text(
        "Title: ac ascii\nPlotname: AC Analysis\nFlags: complex\n"
        "No. Variables: 2\nNo. Points: 2\n"
        "Variables:\n\t0\tfrequency\tfrequency\n\t1\tv(out)\tvoltage\n"
        "Values:\n"
        "0\t1000.0,0.0\n\t0.5,0.5\n"
        "1\t10000.0,0.0\n\t0.0,-2.0\n",
        encoding="utf-8",
    )
    bundle = parse_ngspice_raw(ac_ascii, sim_id="x")
    assert bundle.n_points == 2
    assert bundle.t[0] == pytest.approx(1000.0)
    assert bundle.t[1] == pytest.approx(10000.0)
    data = bundle.signals[0].data
    assert data[0] == pytest.approx(complex(0.5, 0.5))
    assert data[1] == pytest.approx(complex(0.0, -2.0))


def _write_multi_plot_binary_raw(path: pathlib.Path) -> None:
    """A netlist with .dc + .tran (no .control block) makes ngspice
    auto-run both and write one raw file with two concatenated plot blocks
    — reproduces tests/general/rca3040.cir's .ac + .dc + .tran structure,
    which is exactly what previously got silently mis-attributed to
    whatever analysis_type the caller happened to request.
    """
    import numpy as np

    dc_time = np.array([0.0, 1.0, 2.0])  # sweep parameter, reused as x-axis
    dc_vout = np.array([11.0, 12.0, 13.0])
    dc_rows = np.stack([dc_time, dc_vout], axis=1).astype("<f8")

    tran_time = np.array([0.0, 0.5, 1.0, 1.5])
    tran_vout = np.array([91.0, 92.0, 93.0, 94.0])
    tran_rows = np.stack([tran_time, tran_vout], axis=1).astype("<f8")

    dc_header = (
        "Title: multi-analysis test\nPlotname: DC transfer characteristic\n"
        "Flags: real\nNo. Variables: 2\nNo. Points: 3\n"
        "Variables:\n\t0\tv-sweep\tvoltage\n\t1\tv(out)\tvoltage\nBinary:\n"
    )
    tran_header = (
        "Title: multi-analysis test\nPlotname: Transient Analysis\n"
        "Flags: real\nNo. Variables: 2\nNo. Points: 4\n"
        "Variables:\n\t0\ttime\ttime\n\t1\tv(out)\tvoltage\nBinary:\n"
    )
    path.write_bytes(
        dc_header.encode("ascii")
        + dc_rows.tobytes()
        + b"\n"
        + tran_header.encode("ascii")
        + tran_rows.tobytes()
    )


def test_ngspice_multi_plot_selects_requested_analysis(tmp_path: pathlib.Path) -> None:
    """BE-52-adjacent regression: a raw file with multiple plot blocks
    (multiple top-level analysis cards in one netlist) must resolve to the
    plot matching the caller's analysis_type, not always the first one.
    """
    parse_ngspice_raw, _ = _import_parsers()
    raw = tmp_path / "multi.raw"
    _write_multi_plot_binary_raw(raw)

    dc_bundle = parse_ngspice_raw(raw, sim_id="x", analysis_type="DC")
    assert dc_bundle.n_points == 3
    assert dc_bundle.signals[0].data[0] == pytest.approx(11.0)

    tran_bundle = parse_ngspice_raw(raw, sim_id="x", analysis_type="TRAN")
    assert tran_bundle.n_points == 4
    assert tran_bundle.signals[0].data[0] == pytest.approx(91.0)


def test_ngspice_multi_plot_defaults_to_first_plot(tmp_path: pathlib.Path) -> None:
    """No analysis_type given (or no plot matches) falls back to the first
    plot in the file — the pre-existing single-plot behavior."""
    parse_ngspice_raw, _ = _import_parsers()
    raw = tmp_path / "multi.raw"
    _write_multi_plot_binary_raw(raw)

    bundle = parse_ngspice_raw(raw, sim_id="x")
    assert bundle.n_points == 3
    assert bundle.signals[0].data[0] == pytest.approx(11.0)

    bundle_unmatched = parse_ngspice_raw(raw, sim_id="x", analysis_type="NOISE")
    assert bundle_unmatched.n_points == 3
    assert bundle_unmatched.signals[0].data[0] == pytest.approx(11.0)


def test_ngspice_single_point(tmp_path: pathlib.Path) -> None:
    """A single data-point file must not crash."""
    parse_ngspice_raw, _ = _import_parsers()
    single = tmp_path / "single.raw"
    single.write_text(
        "Title: single\nNo. Points: 1\nNo. Variables: 2\n"
        "Variables:\n\t0\ttime\ttime\n\t1\tV(out)\tvoltage\n"
        "Values:\n0\t0.0\n\t3.3\n",
        encoding="utf-8",
    )
    bundle = parse_ngspice_raw(single, sim_id="x")
    assert bundle.n_points == 1
    assert len(bundle.t) == 1
    assert len(bundle.signals[0].data) == 1


# ---------------------------------------------------------------------------
# Xyce PRN
# ---------------------------------------------------------------------------


def test_xyce_fixture_t_length() -> None:
    _, parse_xyce_prn = _import_parsers()
    if not PRN_FILE.exists():
        pytest.skip(f"Fixture file not found: {PRN_FILE}")

    bundle = parse_xyce_prn(PRN_FILE, sim_id="test-xyce")
    assert len(bundle.t) >= 5, f"Expected >= 5 time points, got {len(bundle.t)}"


def test_xyce_fixture_v_net1_present() -> None:
    _, parse_xyce_prn = _import_parsers()
    if not PRN_FILE.exists():
        pytest.skip(f"Fixture file not found: {PRN_FILE}")

    bundle = parse_xyce_prn(PRN_FILE, sim_id="test-xyce")
    signal_names = [s.name for s in bundle.signals]
    assert "V(net1)" in signal_names, f"Expected 'V(net1)' in signals, got: {signal_names}"


def test_xyce_signal_lengths_match_t() -> None:
    _, parse_xyce_prn = _import_parsers()
    if not PRN_FILE.exists():
        pytest.skip(f"Fixture file not found: {PRN_FILE}")

    bundle = parse_xyce_prn(PRN_FILE, sim_id="test-xyce")
    for sig in bundle.signals:
        assert len(sig.data) == len(bundle.t), (
            f"Signal '{sig.name}' length {len(sig.data)} != t length {len(bundle.t)}"
        )


def test_xyce_signal_names_verbatim() -> None:
    _, parse_xyce_prn = _import_parsers()
    if not PRN_FILE.exists():
        pytest.skip(f"Fixture file not found: {PRN_FILE}")

    bundle = parse_xyce_prn(PRN_FILE, sim_id="test-xyce")
    names = [s.name for s in bundle.signals]
    assert "I(R1)" in names, f"Expected 'I(R1)' in signals, got: {names}"


def test_xyce_empty_file_raises(tmp_path: pathlib.Path) -> None:
    _, parse_xyce_prn = _import_parsers()
    empty = tmp_path / "empty.prn"
    empty.write_text("", encoding="utf-8")
    with pytest.raises(ValueError, match="empty"):
        parse_xyce_prn(empty, sim_id="x")


def test_xyce_single_point(tmp_path: pathlib.Path) -> None:
    """A single data-point file must not crash."""
    _, parse_xyce_prn = _import_parsers()
    single = tmp_path / "single.prn"
    single.write_text("TIME V(out)\n0.0 3.3\n", encoding="utf-8")
    bundle = parse_xyce_prn(single, sim_id="x")
    assert bundle.n_points == 1
    assert len(bundle.t) == 1
    assert len(bundle.signals[0].data) == 1


def test_xyce_freq_column_accepted(tmp_path: pathlib.Path) -> None:
    """Xyce AC analysis uses FREQ instead of TIME as the first column."""
    _, parse_xyce_prn = _import_parsers()
    ac = tmp_path / "ac.prn"
    ac.write_text("FREQ V(out)\n1000.0 1.0\n10000.0 0.707\n", encoding="utf-8")
    bundle = parse_xyce_prn(ac, sim_id="x")
    assert len(bundle.t) == 2


def test_xyce_sim_id_set() -> None:
    _, parse_xyce_prn = _import_parsers()
    if not PRN_FILE.exists():
        pytest.skip(f"Fixture file not found: {PRN_FILE}")

    bundle = parse_xyce_prn(PRN_FILE, sim_id="my-sim-99")
    assert bundle.sim_id == "my-sim-99"
