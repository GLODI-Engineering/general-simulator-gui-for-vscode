"""Shared min/max decimation helpers for waveform LOD building/serving (BE-52).

Two distinct decimation strategies live here, used at different points in
the pipeline:

``minmax_decimate_by_value``
    Splits a single signal's *values* into buckets and keeps the argmin/argmax
    of each bucket. This is genuine peak-preserving envelope decimation — a
    spike in the middle of a bucket survives regardless of decimation factor,
    unlike mean-averaging. Used at *write* time (``hdf5_store.py``) to build
    the precomputed LOD pyramid for one signal at a time, where there is no
    "other signals" constraint to satisfy.

``decimate_indices_by_time_bucket``
    Splits the *time axis* into buckets and keeps the argmin/argmax time
    index of each bucket. Because time is monotonic this amounts to keeping
    the first/last sample of each bucket. It does not preserve value peaks,
    but it guarantees every requested signal in a multi-signal query shares
    one output time grid — the wire format the frontend expects. Used at
    *query* time (``lod.py``) for the raw-array fallback path, unchanged from
    the pre-HDF5 implementation.
"""

from __future__ import annotations

import numpy as np


def minmax_decimate_by_value(values: np.ndarray, max_points: int) -> np.ndarray:
    """Return indices into *values* selecting <= max_points entries.

    Splits *values* into ``max_points // 2`` buckets and keeps the argmin and
    argmax index of each bucket (deduplicated, in ascending order). When
    *values* already has <= max_points entries, or max_points < 2, all
    indices are returned unchanged.
    """
    n = len(values)
    if n <= max_points or max_points < 2:
        return np.arange(n, dtype=np.intp)

    n_buckets = max_points // 2
    bucket_size = n / n_buckets

    indices: list[int] = []
    for i in range(n_buckets):
        lo = round(i * bucket_size)
        hi = min(round((i + 1) * bucket_size), n)
        if lo >= n:
            break
        bucket = values[lo:hi]
        if len(bucket) == 0:
            continue
        min_idx = int(np.argmin(bucket)) + lo
        max_idx = int(np.argmax(bucket)) + lo
        lo_idx, hi_idx = (min_idx, max_idx) if min_idx <= max_idx else (max_idx, min_idx)
        indices.append(lo_idx)
        if hi_idx != lo_idx:
            indices.append(hi_idx)

    if not indices:
        return np.arange(n, dtype=np.intp)
    return np.array(sorted(set(indices)), dtype=np.intp)


def decimate_indices_by_time_bucket(
    time_window: np.ndarray,
    max_points: int,
    parent_indices: np.ndarray,
) -> np.ndarray:
    """Return the *parent_indices* entries selected by time-bucket decimation.

    Splits *time_window* into ``max_points // 2`` buckets and keeps the
    argmin/argmax *time* index of each bucket (equivalent to the first/last
    sample per bucket, since time is monotonic), mapped back through
    *parent_indices* so the caller can apply the same selection to parallel
    arrays (other signals sharing this time window). This is the pre-HDF5
    live-decimation behavior, extracted here unchanged so both the raw-array
    LOD fallback and its tests keep working identically.
    """
    n = len(time_window)
    if n <= max_points or max_points < 2:
        return parent_indices

    n_buckets = max_points // 2
    bucket_size = n / n_buckets

    selected: list[int] = []
    for i in range(n_buckets):
        lo = round(i * bucket_size)
        hi = min(round((i + 1) * bucket_size), n)
        if lo >= n:
            break
        bucket = time_window[lo:hi]
        if len(bucket) == 0:
            continue
        min_local = int(np.argmin(bucket)) + lo
        max_local = int(np.argmax(bucket)) + lo
        lo_local, hi_local = (
            (min_local, max_local) if min_local <= max_local else (max_local, min_local)
        )
        selected.append(int(parent_indices[lo_local]))
        if hi_local != lo_local:
            selected.append(int(parent_indices[hi_local]))

    if not selected:
        return parent_indices
    return np.array(selected, dtype=np.intp)
