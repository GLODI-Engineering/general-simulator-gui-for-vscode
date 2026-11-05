"""Built-in unit table for unit_conversion block lowering (BE-44).

Provides:
- ``UnknownUnitError`` — raised when a unit string cannot be resolved.
- ``resolve_scale(from_unit, to_unit)`` — returns the multiplicative scale
  factor such that ``value_in_from_unit * scale == value_in_to_unit``.

The table maps every supported unit name to its SI base value (i.e. how
many SI-base units equal one of this unit).  To convert from unit A to
unit B:

    scale = si_value(A) / si_value(B)

So ``output = input * scale`` gives the value in ``to_unit``.

Supported units (curated engineering list):
    Electrical  : V, kV, mV, µV, A, mA, µA, kA, Ω, kΩ, MΩ, mΩ, F, µF, nF, pF,
                  H, mH, µH, W, kW, MW, mW, J, kJ, MJ
    Temperature : K, °C  (note: °C ↔ K offset is NOT supported — only scale ratios)
    Angle       : rad, °
    Time        : s, ms, µs, ns, ps, min, h
    Frequency   : Hz, kHz, MHz, GHz
    Length      : m, km, cm, mm, µm, nm
    Force       : N, kN, mN
    Torque      : N·m, N·mm
    Mass        : kg, g, mg
    Velocity    : m/s, km/h
    Angular vel : rad/s, rpm
    Pressure    : Pa, kPa, MPa, GPa, bar, mbar, atm, psi

SI prefix aliases are also resolved inline.
"""

from __future__ import annotations

__all__ = ["UnknownUnitError", "resolve_scale"]


class UnknownUnitError(ValueError):
    """Raised when a unit string is not in the built-in unit table."""

    def __init__(self, unit: str) -> None:
        super().__init__(f"Unknown unit: {unit!r}")
        self.unit = unit


# ---------------------------------------------------------------------------
# Internal unit table: maps unit string → SI base value
# (1 <unit> = <value> SI base units)
# ---------------------------------------------------------------------------

_UNIT_TABLE: dict[str, float] = {
    # ── Voltage ──────────────────────────────────────────────────────────
    "V": 1.0,
    "kV": 1_000.0,
    "mV": 1e-3,
    "µV": 1e-6,
    "uV": 1e-6,  # ASCII alias
    # ── Current ──────────────────────────────────────────────────────────
    "A": 1.0,
    "kA": 1_000.0,
    "mA": 1e-3,
    "µA": 1e-6,
    "uA": 1e-6,
    # ── Resistance ───────────────────────────────────────────────────────
    "Ω": 1.0,
    "ohm": 1.0,
    "kΩ": 1_000.0,
    "kohm": 1_000.0,
    "MΩ": 1_000_000.0,
    "Mohm": 1_000_000.0,
    "mΩ": 1e-3,
    "mohm": 1e-3,
    # ── Capacitance ──────────────────────────────────────────────────────
    "F": 1.0,
    "µF": 1e-6,
    "uF": 1e-6,
    "nF": 1e-9,
    "pF": 1e-12,
    # ── Inductance ───────────────────────────────────────────────────────
    "H": 1.0,
    "mH": 1e-3,
    "µH": 1e-6,
    "uH": 1e-6,
    # ── Power ────────────────────────────────────────────────────────────
    "W": 1.0,
    "kW": 1_000.0,
    "MW": 1_000_000.0,
    "mW": 1e-3,
    # ── Energy ───────────────────────────────────────────────────────────
    "J": 1.0,
    "kJ": 1_000.0,
    "MJ": 1_000_000.0,
    # ── Temperature (absolute scale only — no offset conversions) ────────
    "K": 1.0,
    "°C": 1.0,  # scale ratio K/°C = 1; offset not supported
    "degC": 1.0,
    # ── Angle ────────────────────────────────────────────────────────────
    "rad": 1.0,
    "°": 0.017453292519943295,  # π/180
    "deg": 0.017453292519943295,
    # ── Time ─────────────────────────────────────────────────────────────
    "s": 1.0,
    "ms": 1e-3,
    "µs": 1e-6,
    "us": 1e-6,
    "ns": 1e-9,
    "ps": 1e-12,
    "min": 60.0,
    "h": 3_600.0,
    # ── Frequency ────────────────────────────────────────────────────────
    "Hz": 1.0,
    "kHz": 1_000.0,
    "MHz": 1_000_000.0,
    "GHz": 1_000_000_000.0,
    # ── Length ───────────────────────────────────────────────────────────
    "m": 1.0,
    "km": 1_000.0,
    "cm": 1e-2,
    "mm": 1e-3,
    "µm": 1e-6,
    "um": 1e-6,
    "nm": 1e-9,
    # ── Force ────────────────────────────────────────────────────────────
    "N": 1.0,
    "kN": 1_000.0,
    "mN": 1e-3,
    # ── Torque ───────────────────────────────────────────────────────────
    "N·m": 1.0,
    "N*m": 1.0,
    "Nm": 1.0,
    "N·mm": 1e-3,
    "N*mm": 1e-3,
    "Nmm": 1e-3,
    # ── Mass ─────────────────────────────────────────────────────────────
    "kg": 1.0,
    "g": 1e-3,
    "mg": 1e-6,
    # ── Velocity ─────────────────────────────────────────────────────────
    "m/s": 1.0,
    "km/h": 0.2777777777777778,  # 1000/3600
    # ── Angular velocity ─────────────────────────────────────────────────
    "rad/s": 1.0,
    "rpm": 0.10471975511965977,  # 2π/60
    # ── Pressure ─────────────────────────────────────────────────────────
    "Pa": 1.0,
    "kPa": 1_000.0,
    "MPa": 1_000_000.0,
    "GPa": 1_000_000_000.0,
    "bar": 100_000.0,
    "mbar": 100.0,
    "atm": 101_325.0,
    "psi": 6_894.757293168361,
    # ── Dimensionless ────────────────────────────────────────────────────
    "": 1.0,
    "1": 1.0,
    "dB": 1.0,  # log scale — treated as dimensionless ratio
}


def _lookup(unit: str) -> float:
    """Return SI-base value for *unit*, raising UnknownUnitError if not found."""
    value = _UNIT_TABLE.get(unit)
    if value is None:
        raise UnknownUnitError(unit)
    return value


def resolve_scale(from_unit: str, to_unit: str) -> float:
    """Return the multiplicative scale such that ``input * scale`` converts
    a value expressed in *from_unit* into *to_unit*.

    Raises
    ------
    UnknownUnitError
        If either *from_unit* or *to_unit* is not in the built-in table.
    """
    from_si = _lookup(from_unit)
    to_si = _lookup(to_unit)
    return from_si / to_si
