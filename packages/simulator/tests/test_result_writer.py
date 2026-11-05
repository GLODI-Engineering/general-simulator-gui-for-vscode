"""BE-16 / BE-52 — Result writer (manifest + data.h5) tests.

Covers:
- Round-trip: write → read from data.h5 returns identical arrays.
- manifest.json is canonical-key-ordered JSON.
- Signal arrays are float32; time is float64.
- Two writes for the same sim_id raise without an explicit overwrite flag.
"""

from __future__ import annotations

import json
import pathlib
import uuid

import h5py
import numpy as np
import pytest

from simulator.postprocess.hdf5_store import dataset_key


def _import_writer():  # type: ignore[no-untyped-def]
    try:
        from simulator.postprocess.result_writer import (
            ResultBundle,
            ResultWriter,
            SignalArray,
        )

        return ResultWriter, ResultBundle, SignalArray
    except (ImportError, AttributeError):
        pytest.xfail("simulator.postprocess.result_writer not yet implemented")


def _make_bundle(n_points: int = 100):  # type: ignore[no-untyped-def, return]
    _, ResultBundle, SignalArray = _import_writer()
    rng = np.random.default_rng(42)
    time = np.linspace(0, 10, n_points)
    signals = [
        SignalArray(
            name="scope_1.in",
            block_id="blk-scope",
            port_id="in",
            data=rng.standard_normal(n_points).astype("float32"),
        ),
        SignalArray(
            name="scope_1.out",
            block_id="blk-scope",
            port_id="out",
            data=rng.standard_normal(n_points).astype("float32"),
        ),
    ]
    return ResultBundle(
        sim_id=str(uuid.uuid4()),
        t_start=0.0,
        t_end=10.0,
        time=time,
        signals=signals,
    )


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------


def test_time_array_round_trip(tmp_path: pathlib.Path) -> None:
    ResultWriter, _, _ = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    h5_path = tmp_path / "results" / bundle.sim_id / "data.h5"
    assert h5_path.exists(), f"data.h5 not found at {h5_path}"

    with h5py.File(h5_path, "r") as f:
        recovered = f["time"][:]
    np.testing.assert_array_equal(recovered, bundle.time)


def test_signal_arrays_round_trip(tmp_path: pathlib.Path) -> None:
    ResultWriter, _, _ = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    h5_path = tmp_path / "results" / bundle.sim_id / "data.h5"
    with h5py.File(h5_path, "r") as f:
        for sig in bundle.signals:
            key = dataset_key(sig.block_id, sig.port_id)
            assert key in f["signals"], f"No dataset for signal {sig.name}"
            recovered = f["signals"][key][:]
            np.testing.assert_array_equal(recovered, sig.data)


# ---------------------------------------------------------------------------
# dtype checks
# ---------------------------------------------------------------------------


def test_time_npy_is_float64(tmp_path: pathlib.Path) -> None:
    ResultWriter, _, _ = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    h5_path = tmp_path / "results" / bundle.sim_id / "data.h5"
    with h5py.File(h5_path, "r") as f:
        arr = f["time"][:]
    assert arr.dtype == np.float64, f"Expected float64 for time, got {arr.dtype}"


def test_signal_arrays_are_float32(tmp_path: pathlib.Path) -> None:
    ResultWriter, _, _ = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    h5_path = tmp_path / "results" / bundle.sim_id / "data.h5"
    with h5py.File(h5_path, "r") as f:
        for key in f["signals"]:
            arr = f["signals"][key][:]
            assert arr.dtype == np.float32, f"{key} is not float32: {arr.dtype}"


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def test_manifest_json_is_valid(tmp_path: pathlib.Path) -> None:
    ResultWriter, _, _ = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    manifest_path = tmp_path / "results" / bundle.sim_id / "manifest.json"
    assert manifest_path.exists()
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data["sim_id"] == bundle.sim_id
    assert "signals" in data
    assert "t_start" in data
    assert "t_end" in data


def test_manifest_keys_are_sorted(tmp_path: pathlib.Path) -> None:
    """Canonical key order for git-friendly diffs."""
    ResultWriter, _, _ = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    manifest_path = tmp_path / "results" / bundle.sim_id / "manifest.json"
    raw = manifest_path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    keys = list(parsed.keys())
    assert keys == sorted(keys), f"Manifest keys are not sorted: {keys}"


def test_signal_urls_are_relative(tmp_path: pathlib.Path) -> None:
    ResultWriter, _, _ = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    manifest_path = tmp_path / "results" / bundle.sim_id / "manifest.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    for sig_entry in data["signals"]:
        url = sig_entry["url"]
        assert not pathlib.Path(url).is_absolute(), f"URL must be relative: {url!r}"


# ---------------------------------------------------------------------------
# No silent overwrite
# ---------------------------------------------------------------------------


def test_second_write_same_sim_id_raises(tmp_path: pathlib.Path) -> None:
    ResultWriter, _ResultBundle, _SignalArray = _import_writer()
    bundle = _make_bundle()
    writer = ResultWriter(workdir=tmp_path)
    writer.write(bundle)

    with pytest.raises(Exception) as exc_info:
        writer.write(bundle)  # same sim_id, no overwrite flag

    msg = str(exc_info.value).lower()
    assert any(word in msg for word in ("exist", "overwrite", "duplicate", "already")), (
        f"Expected an overwrite-prevention error; got: {exc_info.value!r}"
    )
