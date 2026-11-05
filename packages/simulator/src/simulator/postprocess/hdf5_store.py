"""HDF5-backed result storage (BE-52).

Replaces the pre-HDF5 stopgap (one ``time.npy`` plus one ``.npy`` per signal,
see ``result_writer.py``'s original docstring) with a single ``data.h5`` file
per simulation, matching the storage design in
``docs/specs/simulator-architecture-spec.md`` §7: chunked, LZF-compressed,
float32 signal data, with a precomputed min/max-decimated LOD pyramid built
once at write time so the query-time ``/lod`` endpoint doesn't have to
rescan a full-resolution array on every request.

Layout::

    data.h5
    ├── (attrs: sim_id, t_start, t_end, n_points, schema_version)
    ├── time                       float64[N]
    ├── signals/
    │   ├── <block_id>__<port_id>  float32[N]
    │   └── ...
    └── lod/
        └── <block_id>__<port_id>/
            ├── level_1/{time, value}   ~100x decimated
            ├── level_2/{time, value}   ~10,000x decimated
            └── level_3/{time, value}   ~1,000,000x decimated

Pyramid levels are built via ``decimation.minmax_decimate_by_value`` (genuine
value-extrema decimation, not mean-averaging) so transient spikes survive
regardless of decimation factor. A level is skipped once its source is too
short to benefit — most of today's simulation sizes (thousands of points)
never build a level at all, which is the correct, honest behavior: the
pyramid only pays for itself on the multi-million-point runs the spec is
designed for.
"""

from __future__ import annotations

import pathlib
from typing import TYPE_CHECKING, Any

import h5py
import numpy as np

from simulator.postprocess.decimation import minmax_decimate_by_value

if TYPE_CHECKING:
    from simulator.postprocess.result_writer import ResultBundle

# h5py refuses a chunk shape below the dataset shape; datasets shorter than
# this are stored contiguously (chunking/compression would add overhead for
# no benefit at this size anyway).
_CHUNK_THRESHOLD = 2
_CHUNK_SIZE = 10_000

# LOD pyramid tuning (mirrors simulator-architecture-spec.md §7's table).
_LOD_DECIMATION_FACTOR = 100
_LOD_MAX_LEVELS = 3
# Below this many source points, building a level isn't worth the storage —
# it would barely decimate anything and the raw-array fallback is just as fast.
_LOD_MIN_SOURCE_LEN = 400


def dataset_key(block_id: str, port_id: str) -> str:
    """Return the HDF5 dataset name for one signal.

    Reuses the exact ``<block_id>__<port_id>`` scheme the pre-HDF5 npy writer
    used as a filename, so manifest.json's ``url`` field (and therefore the
    frontend) needs no changes — the filename component of the url is now a
    dataset key instead of a file on disk.
    """
    return f"{block_id}__{port_id}"


def _dataset_kwargs(n: int) -> dict[str, Any]:
    if n < _CHUNK_THRESHOLD:
        return {}
    chunk = min(_CHUNK_SIZE, n)
    return {"chunks": (chunk,), "compression": "lzf", "shuffle": True}


def write_hdf5(bundle: ResultBundle, h5_path: pathlib.Path) -> None:
    """Write *bundle* to a single HDF5 file at *h5_path*.

    Overwrites any existing file at *h5_path* (the caller — result_writer.py
    — is responsible for the sim_id-level no-silent-overwrite check).
    """
    time64 = np.asarray(bundle.time, dtype=np.float64)

    with h5py.File(h5_path, "w") as f:
        f.attrs["sim_id"] = bundle.sim_id
        f.attrs["t_start"] = float(bundle.t_start)
        f.attrs["t_end"] = float(bundle.t_end)
        f.attrs["n_points"] = int(bundle.n_points)
        f.attrs["schema_version"] = 2

        f.create_dataset("time", data=time64, **_dataset_kwargs(len(time64)))

        signals_grp = f.create_group("signals")
        lod_grp = f.create_group("lod")
        for sig in bundle.signals:
            key = dataset_key(sig.block_id, sig.port_id)
            data32 = np.asarray(sig.data, dtype=np.float32)
            signals_grp.create_dataset(key, data=data32, **_dataset_kwargs(len(data32)))
            _write_pyramid(lod_grp, key, time64, data32)


def _write_pyramid(
    lod_grp: h5py.Group,
    key: str,
    time64: np.ndarray,
    data32: np.ndarray,
) -> None:
    """Build up to _LOD_MAX_LEVELS decimated levels for one signal.

    Each level decimates the *previous* level (not the raw signal) by
    ~_LOD_DECIMATION_FACTOR, so level_3 is roughly a 100x100x100 = 1e6x
    reduction of the raw data, matching the spec's level table.
    """
    if len(data32) < _LOD_MIN_SOURCE_LEN:
        return

    sig_grp: h5py.Group | None = None
    level_time, level_value = time64, data32

    for level in range(1, _LOD_MAX_LEVELS + 1):
        n = len(level_value)
        target = max(2, n // _LOD_DECIMATION_FACTOR)
        if n < _LOD_MIN_SOURCE_LEN or target >= n:
            break

        idx = minmax_decimate_by_value(level_value, target)
        level_value = level_value[idx]
        level_time = level_time[idx]

        if sig_grp is None:
            sig_grp = lod_grp.create_group(key)
        level_group = sig_grp.create_group(f"level_{level}")
        level_group.create_dataset(
            "time",
            data=level_time.astype(np.float64),
            **_dataset_kwargs(len(level_time)),
        )
        level_group.create_dataset(
            "value",
            data=level_value.astype(np.float32),
            **_dataset_kwargs(len(level_value)),
        )
