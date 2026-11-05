"""BE-52 — HDF5 result storage write side.

Covers:
- write_hdf5 round-trips /time and /signals/<key> exactly.
- Pyramid levels are built for large signals, skipped for small ones.
- Pyramid levels each halve-ish in length (~100x) relative to their source
  and are shorter than the raw signal.
- dataset_key matches the pre-HDF5 filename convention.
"""

from __future__ import annotations

import itertools
import pathlib
import uuid

import h5py
import numpy as np
import pytest

from simulator.postprocess.hdf5_store import dataset_key, write_hdf5
from simulator.postprocess.result_writer import ResultBundle, SignalArray


def _bundle(n_points: int, *, n_signals: int = 1) -> ResultBundle:
    rng = np.random.default_rng(7)
    time = np.linspace(0.0, 1.0, n_points)
    signals = [
        SignalArray(
            name=f"sig_{i}",
            block_id=f"blk{i}",
            port_id="out",
            data=rng.standard_normal(n_points).astype(np.float32),
        )
        for i in range(n_signals)
    ]
    return ResultBundle(
        sim_id=str(uuid.uuid4()),
        t_start=0.0,
        t_end=1.0,
        time=time,
        signals=signals,
    )


def test_dataset_key_matches_pre_hdf5_filename_convention() -> None:
    assert dataset_key("blk-scope", "in") == "blk-scope__in"


def test_time_round_trips_as_float64(tmp_path: pathlib.Path) -> None:
    bundle = _bundle(500)
    h5_path = tmp_path / "data.h5"
    write_hdf5(bundle, h5_path)

    with h5py.File(h5_path, "r") as f:
        recovered = f["time"][:]
        assert recovered.dtype == np.float64
        np.testing.assert_array_equal(recovered, bundle.time)


def test_signal_round_trips_as_float32(tmp_path: pathlib.Path) -> None:
    bundle = _bundle(500)
    h5_path = tmp_path / "data.h5"
    write_hdf5(bundle, h5_path)

    with h5py.File(h5_path, "r") as f:
        sig = bundle.signals[0]
        key = dataset_key(sig.block_id, sig.port_id)
        recovered = f["signals"][key][:]
        assert recovered.dtype == np.float32
        np.testing.assert_array_equal(recovered, sig.data)


def test_attrs_are_written(tmp_path: pathlib.Path) -> None:
    bundle = _bundle(200)
    h5_path = tmp_path / "data.h5"
    write_hdf5(bundle, h5_path)

    with h5py.File(h5_path, "r") as f:
        assert f.attrs["sim_id"] == bundle.sim_id
        assert f.attrs["t_start"] == pytest.approx(bundle.t_start)
        assert f.attrs["t_end"] == pytest.approx(bundle.t_end)
        assert f.attrs["schema_version"] == 2


def test_no_pyramid_for_short_signal(tmp_path: pathlib.Path) -> None:
    bundle = _bundle(50)  # well under _LOD_MIN_SOURCE_LEN
    h5_path = tmp_path / "data.h5"
    write_hdf5(bundle, h5_path)

    with h5py.File(h5_path, "r") as f:
        key = dataset_key(bundle.signals[0].block_id, bundle.signals[0].port_id)
        assert key not in f["lod"], "Short signals should not get a pyramid"


def test_pyramid_built_for_long_signal(tmp_path: pathlib.Path) -> None:
    bundle = _bundle(50_000)
    h5_path = tmp_path / "data.h5"
    write_hdf5(bundle, h5_path)

    with h5py.File(h5_path, "r") as f:
        key = dataset_key(bundle.signals[0].block_id, bundle.signals[0].port_id)
        sig_lod = f["lod"][key]
        assert "level_1" in sig_lod

        raw_len = len(f["signals"][key])
        level_1_len = len(sig_lod["level_1"]["value"])
        assert level_1_len < raw_len, "level_1 must be shorter than the raw signal"

        # Each present level's time/value arrays are paired and equal length.
        for level_name in sig_lod:
            level = sig_lod[level_name]
            assert len(level["time"]) == len(level["value"])
            assert level["time"].dtype == np.float64
            assert level["value"].dtype == np.float32


def test_pyramid_levels_are_monotonically_decimated(tmp_path: pathlib.Path) -> None:
    """level_2 (if present) must be shorter than level_1, etc."""
    bundle = _bundle(2_000_000)
    h5_path = tmp_path / "data.h5"
    write_hdf5(bundle, h5_path)

    with h5py.File(h5_path, "r") as f:
        key = dataset_key(bundle.signals[0].block_id, bundle.signals[0].port_id)
        sig_lod = f["lod"][key]
        level_names = sorted(sig_lod.keys())
        assert len(level_names) >= 2, "A 2M-point signal should build multiple levels"
        lengths = [len(sig_lod[name]["value"]) for name in level_names]
        assert lengths == sorted(lengths, reverse=True)
        assert all(a > b for a, b in itertools.pairwise(lengths)), (
            f"Levels must strictly shrink: {lengths}"
        )


def test_multiple_signals_each_get_independent_datasets(tmp_path: pathlib.Path) -> None:
    bundle = _bundle(1000, n_signals=3)
    h5_path = tmp_path / "data.h5"
    write_hdf5(bundle, h5_path)

    with h5py.File(h5_path, "r") as f:
        for sig in bundle.signals:
            key = dataset_key(sig.block_id, sig.port_id)
            assert key in f["signals"]
            np.testing.assert_array_equal(f["signals"][key][:], sig.data)


def test_write_hdf5_overwrites_existing_file(tmp_path: pathlib.Path) -> None:
    h5_path = tmp_path / "data.h5"
    write_hdf5(_bundle(100), h5_path)
    second = _bundle(200)
    write_hdf5(second, h5_path)  # must not raise, must fully replace contents

    with h5py.File(h5_path, "r") as f:
        assert f.attrs["sim_id"] == second.sim_id
        assert len(f["time"]) == 200
