"""LOD (level-of-detail) waveform slice serving, backed by HDF5 (BE-48, BE-52).

Given a time window and one or more signal names, this module:

1. Clamps the requested [t_start, t_end] window to the available data range.
2. For a single requested signal with a precomputed pyramid (see
   ``simulator.postprocess.hdf5_store``), picks the coarsest pyramid level
   that still meets *max_points* resolution for the window, avoiding a scan
   of the full-resolution array.
3. Otherwise (multiple signals, or a window needing finer-than-stored
   resolution) falls back to the raw ``/time`` + ``/signals/<key>`` datasets,
   decimated live with the same time-bucketed algorithm this module has used
   since before the HDF5 migration.

The wire format returned by :func:`compute_lod_slice` matches the
``LODResponse`` TypeScript interface expected by *lod-client.ts*::

    { t: float64[], <signal_name>: float64[], ... }

All arrays are returned as plain Python :class:`list` objects so that they
serialise cleanly to JSON floats in the HTTP handler.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import h5py
import numpy as np

from simulator.postprocess.decimation import decimate_indices_by_time_bucket


def _load_name_to_key(sim_dir: pathlib.Path) -> dict[str, str]:
    """Map manifest signal ``name`` -> HDF5 dataset key, via the signal url.

    The url's filename component (``<block_id>__<port_id>.npy``) is exactly
    the HDF5 dataset key with a ``.npy`` suffix appended for the /signals
    HTTP route's benefit — stripping it recovers the key.
    """
    manifest_path = sim_dir / "manifest.json"
    if not manifest_path.exists():
        return {}
    with manifest_path.open("r", encoding="utf-8") as fh:
        manifest: dict[str, Any] = json.load(fh)
    mapping: dict[str, str] = {}
    for entry in manifest.get("signals", []):
        name = entry.get("name")
        url = entry.get("url")
        if not name or not url:
            continue
        mapping[name] = pathlib.Path(url).stem
    return mapping


def compute_lod_slice(
    sim_dir: pathlib.Path,
    signal_names: list[str],
    t_start: float,
    t_end: float,
    max_points: int,
) -> dict[str, Any]:
    """Compute a decimated LOD slice for the given signals.

    Parameters
    ----------
    sim_dir:
        The simulation result directory (``<results_root>/<sim_id>``).
        Must contain ``data.h5`` and ``manifest.json`` as written by
        ``result_writer.py`` / ``hdf5_store.py``.
    signal_names:
        List of signal names as they appear in ``manifest.json`` (the ``name``
        field, e.g. ``"V(net1)"`` or ``"myblock.out"``).
    t_start:
        Requested window start (seconds). Clamped to the actual data range.
    t_end:
        Requested window end (seconds). Clamped to the actual data range.
    max_points:
        Maximum number of samples to return in the time array (and each signal
        array). When the window has fewer raw samples no decimation is applied.

    Returns
    -------
    dict
        A dictionary with key ``"t"`` holding a list of float64 time values and
        one key per requested signal name holding a list of float64 values.
        Missing signals are silently omitted. This maps directly to the
        ``LODResponse`` wire format expected by ``lod-client.ts``.
    """
    h5_path = sim_dir / "data.h5"
    if not h5_path.exists():
        return {"t": []}

    name_to_key = _load_name_to_key(sim_dir)

    with h5py.File(h5_path, "r") as f:
        time_ds = f["time"]
        if len(time_ds) == 0:
            return {"t": []}

        data_t_start = float(time_ds[0])
        data_t_end = float(time_ds[-1])
        t_lo = max(t_start, data_t_start)
        t_hi = min(t_end, data_t_end)

        if t_lo > t_hi:
            result: dict[str, Any] = {"t": []}
            for name in signal_names:
                result[name] = []
            return result

        # Single-signal fast path: serve from the precomputed pyramid when
        # one exists and is coarse enough to still satisfy max_points.
        if len(signal_names) == 1:
            name = signal_names[0]
            key = name_to_key.get(name)
            lod_group = f.get("lod")
            if key is not None and lod_group is not None and key in lod_group:
                return _lod_from_pyramid(
                    f,
                    lod_group[key],
                    key,
                    name,
                    t_lo,
                    t_hi,
                    max_points,
                    data_t_start,
                    data_t_end,
                )

        return _lod_from_raw(f, name_to_key, signal_names, t_lo, t_hi, max_points)


def _lod_from_pyramid(
    f: h5py.File,
    sig_lod_group: h5py.Group,
    key: str,
    name: str,
    t_lo: float,
    t_hi: float,
    max_points: int,
    data_t_start: float,
    data_t_end: float,
) -> dict[str, Any]:
    """Serve one signal from the coarsest pyramid level that still meets
    max_points resolution for the requested window; falls back to the raw
    /time + /signals/<key> datasets when no stored level is coarse-enough-
    yet-sufficient (i.e. the window needs full resolution).
    """
    full_span = data_t_end - data_t_start
    window_span = t_hi - t_lo
    window_fraction = (window_span / full_span) if full_span > 0 else 1.0

    chosen_time: Any = f["time"]
    chosen_value: Any = f["signals"][key]

    # Levels are named level_1 (finest) .. level_N (coarsest); walk from
    # coarsest to finest and take the first one still meeting max_points.
    level_names = sorted(sig_lod_group.keys(), reverse=True)
    for level_name in level_names:
        level_group = sig_lod_group[level_name]
        level_len = len(level_group["time"])
        estimated_points = level_len * window_fraction
        if estimated_points >= max_points:
            chosen_time = level_group["time"]
            chosen_value = level_group["value"]
            break

    t_all = chosen_time[:]
    v_all = chosen_value[:]

    mask = (t_all >= t_lo) & (t_all <= t_hi)
    t_window = t_all[mask]
    if len(t_window) == 0:
        return {"t": [], name: []}

    window_indices = np.where(mask)[0]
    final_indices = decimate_indices_by_time_bucket(t_window, max_points, window_indices)

    return {
        "t": t_all[final_indices].tolist(),
        name: v_all[final_indices].tolist(),
    }


def _lod_from_raw(
    f: h5py.File,
    name_to_key: dict[str, str],
    signal_names: list[str],
    t_lo: float,
    t_hi: float,
    max_points: int,
) -> dict[str, Any]:
    """Live decimation over the raw /time + /signals/<key> datasets.

    Shared across every requested signal (one output "t" grid), matching
    the pre-HDF5 behaviour byte-for-byte.
    """
    t_all = f["time"][:].astype(np.float64)
    mask = (t_all >= t_lo) & (t_all <= t_hi)
    t_window = t_all[mask]

    if len(t_window) == 0:
        result: dict[str, Any] = {"t": []}
        for name in signal_names:
            result[name] = []
        return result

    window_indices = np.where(mask)[0]
    final_indices = decimate_indices_by_time_bucket(t_window, max_points, window_indices)

    result = {"t": t_all[final_indices].tolist()}

    signals_grp = f.get("signals")
    for name in signal_names:
        key = name_to_key.get(name)
        if key is None or signals_grp is None or key not in signals_grp:
            continue
        v_all = signals_grp[key][:].astype(np.float64)
        if len(v_all) != len(t_all):
            continue
        result[name] = v_all[final_indices].tolist()

    return result
