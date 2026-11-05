"""Bode stability margin computation (BE-51).

Given a frequency sweep with magnitude (dB) and phase (degrees) arrays,
compute the standard stability metrics used by the frontend measurement panel.

Exports
-------
BodeMargins          — dataclass with 6 margin fields (None when not computable).
compute_bode_margins — compute BodeMargins from freq/mag_db/phase_deg arrays.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class BodeMargins:
    """Standard Bode stability margins.

    All fields are None when the corresponding metric cannot be determined
    (e.g. no phase crossover → gain_margin_db is None).
    """

    gain_margin_db: float | None
    phase_margin_deg: float | None
    delay_margin_s: float | None
    gain_crossover_hz: float | None
    phase_crossover_hz: float | None
    bandwidth_3db_hz: float | None


def _interpolate_crossing(x: np.ndarray, y: np.ndarray, threshold: float) -> float | None:
    """Return the x value where y first crosses threshold (linear interpolation).

    Scans left-to-right and returns the first crossing.  Returns None if no
    crossing is found.
    """
    diff = y - threshold
    for i in range(len(diff) - 1):
        if diff[i] * diff[i + 1] <= 0 and not (diff[i] == 0 and diff[i + 1] == 0):
            # Linear interpolation in the interval [x[i], x[i+1]].
            d = diff[i + 1] - diff[i]
            if d == 0:
                return float(x[i])
            t = -diff[i] / d
            return float(x[i] + t * (x[i + 1] - x[i]))
    return None


def compute_bode_margins(
    freq: np.ndarray,
    mag_db: np.ndarray,
    phase_deg: np.ndarray,
) -> BodeMargins:
    """Compute Bode stability margins from frequency-domain arrays.

    Parameters
    ----------
    freq:
        Frequency axis in Hz (positive, monotonically increasing).
    mag_db:
        Magnitude in dB, same length as ``freq``.
    phase_deg:
        Phase in degrees, same length as ``freq``.  Typically in the range
        [-360, 0] for a passive / minimum-phase system, but the function
        handles arbitrary unwrapped or wrapped phase.

    Returns
    -------
    BodeMargins
        All 6 margin fields.  Any metric that cannot be determined is None.
    """
    freq = np.asarray(freq, dtype=np.float64)
    mag_db = np.asarray(mag_db, dtype=np.float64)
    phase_deg = np.asarray(phase_deg, dtype=np.float64)

    if freq.ndim != 1 or mag_db.ndim != 1 or phase_deg.ndim != 1:
        raise ValueError("freq, mag_db, and phase_deg must be 1-D arrays.")
    if not (len(freq) == len(mag_db) == len(phase_deg)):
        raise ValueError("freq, mag_db, and phase_deg must have the same length.")
    if len(freq) < 2:
        return BodeMargins(
            gain_margin_db=None,
            phase_margin_deg=None,
            delay_margin_s=None,
            gain_crossover_hz=None,
            phase_crossover_hz=None,
            bandwidth_3db_hz=None,
        )

    # ------------------------------------------------------------------
    # Gain crossover: frequency where |mag_db| crosses 0 dB.
    # ------------------------------------------------------------------
    gain_crossover_hz = _interpolate_crossing(freq, mag_db, 0.0)

    # ------------------------------------------------------------------
    # Phase margin: phase at the gain crossover + 180°.
    # ------------------------------------------------------------------
    phase_margin_deg: float | None = None
    if gain_crossover_hz is not None:
        # Interpolate phase at gain_crossover_hz.
        phase_at_gc = float(np.interp(gain_crossover_hz, freq, phase_deg))
        phase_margin_deg = phase_at_gc + 180.0

    # ------------------------------------------------------------------
    # Phase crossover: frequency where phase_deg crosses -180 deg.
    # ------------------------------------------------------------------
    phase_crossover_hz = _interpolate_crossing(freq, phase_deg, -180.0)

    # ------------------------------------------------------------------
    # Gain margin: -mag_db at the phase crossover.
    # ------------------------------------------------------------------
    gain_margin_db: float | None = None
    if phase_crossover_hz is not None:
        mag_at_pc = float(np.interp(phase_crossover_hz, freq, mag_db))
        gain_margin_db = -mag_at_pc

    # ------------------------------------------------------------------
    # Delay margin: PM / (360 * f_gc)  [seconds].
    # ------------------------------------------------------------------
    delay_margin_s: float | None = None
    if phase_margin_deg is not None and gain_crossover_hz is not None and gain_crossover_hz > 0.0:
        delay_margin_s = phase_margin_deg / (360.0 * gain_crossover_hz)

    # ------------------------------------------------------------------
    # Bandwidth (-3 dB): frequency where mag_db drops 3 dB below the
    # reference level max(mag_db[0], 0).
    # ------------------------------------------------------------------
    bandwidth_3db_hz: float | None = None
    ref_db = max(float(mag_db[0]), 0.0)
    cutoff_db = ref_db - 3.0
    bandwidth_3db_hz = _interpolate_crossing(freq, mag_db, cutoff_db)

    return BodeMargins(
        gain_margin_db=gain_margin_db,
        phase_margin_deg=phase_margin_deg,
        delay_margin_s=delay_margin_s,
        gain_crossover_hz=gain_crossover_hz,
        phase_crossover_hz=phase_crossover_hz,
        bandwidth_3db_hz=bandwidth_3db_hz,
    )
