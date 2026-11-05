"""BE-52 — shared min/max decimation helpers.

Covers:
- minmax_decimate_by_value preserves an interior spike regardless of factor.
- minmax_decimate_by_value is a no-op when the input already fits max_points.
- decimate_indices_by_time_bucket keeps the pre-HDF5 time-bucketed semantics
  (first/last sample per bucket, mapped through parent_indices).
"""

from __future__ import annotations

import numpy as np

from simulator.postprocess.decimation import (
    decimate_indices_by_time_bucket,
    minmax_decimate_by_value,
)


def test_minmax_decimate_by_value_preserves_interior_spike() -> None:
    n = 10_000
    values = np.zeros(n, dtype=np.float32)
    spike_index = 4321
    values[spike_index] = 1000.0

    idx = minmax_decimate_by_value(values, max_points=200)

    assert len(idx) <= 200
    assert spike_index in idx, "Interior spike must survive value-based decimation"


def test_minmax_decimate_by_value_preserves_interior_dip() -> None:
    n = 10_000
    values = np.ones(n, dtype=np.float32)
    dip_index = 7777
    values[dip_index] = -1000.0

    idx = minmax_decimate_by_value(values, max_points=200)

    assert dip_index in idx, "Interior dip must survive value-based decimation"


def test_minmax_decimate_by_value_noop_when_already_small() -> None:
    values = np.arange(50, dtype=np.float32)
    idx = minmax_decimate_by_value(values, max_points=200)
    np.testing.assert_array_equal(idx, np.arange(50, dtype=np.intp))


def test_minmax_decimate_by_value_caps_output_length() -> None:
    values = np.random.default_rng(1).standard_normal(50_000).astype(np.float32)
    idx = minmax_decimate_by_value(values, max_points=1000)
    assert len(idx) <= 1000
    assert np.all(np.diff(idx) > 0), "Indices must be strictly increasing"


def test_decimate_indices_by_time_bucket_keeps_bucket_endpoints() -> None:
    t = np.linspace(0.0, 1.0, 10_000)
    parent = np.arange(len(t), dtype=np.intp)

    idx = decimate_indices_by_time_bucket(t, max_points=500, parent_indices=parent)

    assert len(idx) <= 500
    # Since time is monotonic, argmin/argmax per bucket == first/last sample.
    assert idx[0] == parent[0]
    assert idx[-1] == parent[-1]
    assert np.all(np.diff(idx) > 0)


def test_decimate_indices_by_time_bucket_noop_when_already_small() -> None:
    t = np.linspace(0.0, 1.0, 50)
    parent = np.arange(len(t), dtype=np.intp)
    idx = decimate_indices_by_time_bucket(t, max_points=500, parent_indices=parent)
    np.testing.assert_array_equal(idx, parent)


def test_decimate_indices_by_time_bucket_respects_parent_index_offset() -> None:
    """parent_indices need not start at 0 (e.g. a window slice of a larger array)."""
    t_window = np.linspace(0.3, 0.7, 4000)
    parent = np.arange(3000, 7000, dtype=np.intp)

    idx = decimate_indices_by_time_bucket(t_window, max_points=300, parent_indices=parent)

    assert len(idx) <= 300
    assert idx.min() >= 3000
    assert idx.max() < 7000
