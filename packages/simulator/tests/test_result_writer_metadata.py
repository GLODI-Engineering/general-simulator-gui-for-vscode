from __future__ import annotations

import json
import pathlib

import numpy as np

from simulator.postprocess.result_writer import ResultBundle, SignalArray, infer_signal_meta, write


def test_infer_signal_meta_noise_analysis_is_not_mislabeled_transient() -> None:
    """A NOISE-analysis signal (e.g. onoise_spectrum) must not fall through to
    the ("transient", "time") default — that default is what every unmapped
    analysis_type silently got before NOISE was added to _ANALYSIS_TYPE_MAP,
    which mislabeled real noise-analysis results as transient/time-domain.
    """
    analysis, _quantity, _unit, domain = infer_signal_meta("onoise_spectrum", "NOISE")
    assert analysis == "noise"
    assert domain == "frequency"


def test_transient_manifest_includes_be47_metadata(tmp_path: pathlib.Path) -> None:
    t = np.linspace(0.0, 1.0, 8)
    bundle = ResultBundle(
        sim_id="be47-tran",
        t_start=0.0,
        t_end=1.0,
        time=t,
        n_points=len(t),
        signals=[
            SignalArray(
                name="V(out)",
                block_id="scope",
                port_id="out",
                data=np.linspace(0.0, 1.0, len(t), dtype=np.float32),
                analysis="transient",
                quantity="voltage",
                unit="V",
                domain="time",
            )
        ],
    )

    write(bundle, tmp_path, overwrite=True)
    manifest = json.loads((tmp_path / "results" / "be47-tran" / "manifest.json").read_text())

    assert manifest["schema_version"] == 2
    signal = manifest["signals"][0]
    assert signal["analysis"] == "transient"
    assert signal["domain"] == "time"
    assert signal["quantity"] == "voltage"
    assert signal["unit"] == "V"


def test_ac_entries_round_trip_with_metadata_fields(tmp_path: pathlib.Path) -> None:
    freq = np.array([1.0, 10.0, 100.0], dtype=np.float64)
    mag = np.array([1.0, 0.5, 0.1], dtype=np.float32)
    phase = np.array([0.0, -20.0, -60.0], dtype=np.float32)
    bundle = ResultBundle(
        sim_id="be47-ac",
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
    )

    write(bundle, tmp_path, overwrite=True)
    manifest = json.loads((tmp_path / "results" / "be47-ac" / "manifest.json").read_text())

    by_analysis = {entry["analysis"]: entry for entry in manifest["signals"]}
    assert "ac_mag" in by_analysis
    assert "ac_phase" in by_analysis
    assert by_analysis["ac_mag"]["domain"] == "frequency"
    assert by_analysis["ac_phase"]["domain"] == "frequency"


def test_dc_sweep_manifest_keeps_swept_param(tmp_path: pathlib.Path) -> None:
    t = np.array([0.0, 1.0, 2.0], dtype=np.float64)
    bundle = ResultBundle(
        sim_id="be47-dc",
        t_start=0.0,
        t_end=2.0,
        time=t,
        n_points=len(t),
        signals=[
            SignalArray(
                name="V(out)",
                block_id="dc",
                port_id="out",
                data=np.array([1.0, 2.0, 3.0], dtype=np.float32),
                analysis="dc_sweep",
                quantity="voltage",
                unit="V",
                domain="parameter",
                swept_param="V1",
            )
        ],
    )

    write(bundle, tmp_path, overwrite=True)
    manifest = json.loads((tmp_path / "results" / "be47-dc" / "manifest.json").read_text())

    signal = manifest["signals"][0]
    assert signal["analysis"] == "dc_sweep"
    assert signal["domain"] == "parameter"
    assert signal["swept_param"] == "V1"
