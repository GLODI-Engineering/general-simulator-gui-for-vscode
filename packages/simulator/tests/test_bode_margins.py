from __future__ import annotations

import json
import pathlib

import numpy as np

from simulator.postprocess.bode_margins import compute_bode_margins
from simulator.postprocess.result_writer import ResultBundle, SignalArray, write


def test_rc_lowpass_bandwidth_is_about_159_hz() -> None:
    r = 1_000.0
    c = 1e-6
    tau = r * c
    freq = np.logspace(0, 5, 2000)
    w = 2.0 * np.pi * freq

    # |H(jw)| = 1 / sqrt(1 + (w*RC)^2)
    mag = 1.0 / np.sqrt(1.0 + (w * tau) ** 2)
    mag_db = 20.0 * np.log10(mag)
    phase_deg = -np.degrees(np.arctan(w * tau))

    margins = compute_bode_margins(freq, mag_db, phase_deg)

    expected_fc = 1.0 / (2.0 * np.pi * tau)
    assert margins.bandwidth_3db_hz is not None
    assert abs(margins.bandwidth_3db_hz - expected_fc) / expected_fc <= 0.05


def test_no_minus_180_crossing_returns_null_gain_margin() -> None:
    freq = np.logspace(0, 4, 500)
    mag_db = np.linspace(10.0, -40.0, len(freq))
    phase_deg = np.linspace(-10.0, -120.0, len(freq))

    margins = compute_bode_margins(freq, mag_db, phase_deg)

    assert margins.gain_margin_db is None
    assert margins.phase_crossover_hz is None


def test_known_phase_margin_with_synthetic_linear_crossing() -> None:
    # Gain crossover exactly at 10 Hz, phase there exactly -120° => PM = 60°.
    freq = np.array([1.0, 10.0, 100.0], dtype=np.float64)
    mag_db = np.array([20.0, 0.0, -20.0], dtype=np.float64)
    phase_deg = np.array([-90.0, -120.0, -210.0], dtype=np.float64)

    margins = compute_bode_margins(freq, mag_db, phase_deg)

    assert margins.gain_crossover_hz is not None
    assert abs(margins.gain_crossover_hz - 10.0) < 1e-9
    assert margins.phase_margin_deg is not None
    assert abs(margins.phase_margin_deg - 60.0) <= 1.0


def test_writer_persists_bode_margins_for_ac_bundle(tmp_path: pathlib.Path) -> None:
    freq = np.array([1.0, 10.0, 100.0], dtype=np.float64)
    mag = np.array([1.0, 0.5, 0.1], dtype=np.float32)
    phase = np.array([0.0, -20.0, -60.0], dtype=np.float32)

    margins = compute_bode_margins(
        freq,
        20.0 * np.log10(np.maximum(mag.astype(np.float64), 1e-12)),
        phase.astype(np.float64),
    )

    bundle = ResultBundle(
        sim_id="be51-ac",
        t_start=float(freq[0]),
        t_end=float(freq[-1]),
        time=freq,
        n_points=len(freq),
        signals=[
            SignalArray(
                name="V(out)",
                block_id="ac",
                port_id="out",
                data=mag,
                analysis="ac_mag",
                quantity="voltage",
                unit="V",
                domain="frequency",
            ),
            SignalArray(
                name="V(out)_phase",
                block_id="ac",
                port_id="out_phase",
                data=phase,
                analysis="ac_phase",
                quantity="phase",
                unit="°",
                domain="frequency",
            ),
        ],
        bode_margins={
            "gain_margin_db": margins.gain_margin_db,
            "phase_margin_deg": margins.phase_margin_deg,
            "delay_margin_s": margins.delay_margin_s,
            "gain_crossover_hz": margins.gain_crossover_hz,
            "phase_crossover_hz": margins.phase_crossover_hz,
            "bandwidth_3db_hz": margins.bandwidth_3db_hz,
        },
    )

    write(bundle, tmp_path, overwrite=True)
    manifest = json.loads((tmp_path / "results" / "be51-ac" / "manifest.json").read_text())

    assert "bode_margins" in manifest
    assert set(manifest["bode_margins"].keys()) == {
        "gain_margin_db",
        "phase_margin_deg",
        "delay_margin_s",
        "gain_crossover_hz",
        "phase_crossover_hz",
        "bandwidth_3db_hz",
    }
