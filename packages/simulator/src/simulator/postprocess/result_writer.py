"""Result writer: write a ResultBundle to disk (BE-16, BE-47, BE-50, BE-51, BE-52).

Writes a single data.h5 (BE-52 — see hdf5_store.py) and a manifest.json
index. Prior to BE-52 this wrote one time.npy plus one .npy per signal;
manifest.json's shape and signal url scheme are unchanged so that migration
was transparent to every HTTP consumer (see hdf5_store.py's docstring).

Exports
-------
SignalArray   — lightweight value type for a single named waveform.
DcOpEntry     — one row in the dc_op_table (BE-50).
ResultBundle  — aggregates SignalArray list + time vector + metadata.
ResultWriter  — writes a ResultBundle to disk.
infer_signal_meta — infer (analysis, quantity, unit, domain) from name + analysis type.
"""

from __future__ import annotations

import json
import pathlib
import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from simulator.postprocess.hdf5_store import dataset_key, write_hdf5

_SCHEMA_VERSION = 2


# ---------------------------------------------------------------------------
# Metadata helpers (BE-47)
# ---------------------------------------------------------------------------

# Maps lowercase SPICE signal-name prefix → (quantity, unit)
_NAME_PREFIX_META: dict[str, tuple[str, str]] = {
    "v(": ("voltage", "V"),
    "vn(": ("voltage", "V"),
    "vp(": ("voltage", "V"),
    "i(": ("current", "A"),
    "p(": ("power", "W"),
    "temp(": ("temperature", "°C"),
    "t(": ("temperature", "°C"),
}

# Maps analysis_type string (uppercase) → (analysis tag, domain)
_ANALYSIS_TYPE_MAP: dict[str, tuple[str, str]] = {
    "TRAN": ("transient", "time"),
    "AC": ("ac_mag", "frequency"),
    "DC": ("dc_sweep", "parameter"),
    "OP": ("dc_op", "parameter"),
    "NOISE": ("noise", "frequency"),
}

# Extracts the bare node/branch name from a SPICE signal name, e.g.
# "v(net3)" -> "net3", "i(vin)" -> "vin".
_NODE_NAME_RE = re.compile(r"^[a-z]+\(([^)]+)\)$", re.IGNORECASE)

# .gsim_sch PortKind domains that mean "this node carries an abstract
# signal-flow value, not a physical voltage/current" — see
# spice_netlist_writer.compute_node_domains (BE-63).
_SIGNAL_DOMAINS = frozenset({"signal", "signal-bus"})


def infer_signal_meta(
    name: str,
    analysis_type: str,
    *,
    node_domains: dict[str, str] | None = None,
) -> tuple[str, str, str, str]:
    """Return (analysis, quantity, unit, domain) for a signal.

    ``analysis_type`` must be one of TRAN, AC, DC, OP (case-insensitive).
    Quantity and unit are inferred from the signal name using SPICE
    conventions — *unless* ``node_domains`` (from
    ``spice_netlist_writer.compute_node_domains``) says the underlying
    node originated from a signal-flow (not physical-electrical) wire, in
    which case it is tagged dimensionless/unitless regardless of the
    ``v(...)``/``i(...)`` name prefix ngspice happens to print it with —
    ngspice makes no such distinction itself, so this override is the only
    place that knowledge can be reintroduced.
    """
    analysis_upper = analysis_type.upper()
    analysis, domain = _ANALYSIS_TYPE_MAP.get(analysis_upper, ("transient", "time"))

    name_lower = name.lower()

    if node_domains:
        match = _NODE_NAME_RE.match(name.strip())
        if match and node_domains.get(match.group(1)) in _SIGNAL_DOMAINS:
            return analysis, "dimensionless", "", domain

    quantity = "dimensionless"
    unit = ""
    for prefix, (q, u) in _NAME_PREFIX_META.items():
        if name_lower.startswith(prefix):
            quantity = q
            unit = u
            break

    return analysis, quantity, unit, domain


# ---------------------------------------------------------------------------
# Data types (also importable by tests)
# ---------------------------------------------------------------------------


@dataclass
class SignalArray:
    """A single named signal waveform with visualization metadata (BE-47)."""

    name: str
    block_id: str
    port_id: str
    data: np.ndarray  # float32[N]
    # BE-47 metadata fields (optional, default to transient dimensionless signal)
    analysis: str = "transient"
    quantity: str = "dimensionless"
    unit: str = ""
    domain: str = "time"
    swept_param: str | None = None


@dataclass
class DcOpEntry:
    """One row in the DC operating-point table (BE-50).

    Each entry represents a scalar node voltage or branch current from an OP
    analysis — not a waveform — so it is stored in dc_op_table rather than the
    signals array.
    """

    node_or_branch: str
    quantity: str
    value: float
    unit: str


@dataclass
class ResultBundle:
    """Aggregated simulation result.

    Can be constructed directly (test path) or converted from a solver
    protocol ResultBundle via ``ResultBundle.from_protocol()``.
    """

    sim_id: str
    t_start: float
    t_end: float
    # Accept either ``time`` or ``t`` for the time vector.
    time: np.ndarray = field(default_factory=lambda: np.empty(0))
    t: np.ndarray | None = field(default=None)
    signals: list[SignalArray] = field(default_factory=list)
    n_points: int = 0
    # BE-50: populated only for OP analysis; None for all other analysis types.
    dc_op_table: list[DcOpEntry] | None = None
    # BE-51: populated only for AC analysis; None for all other analysis types.
    bode_margins: dict[str, object] | None = None

    def __post_init__(self) -> None:
        # Normalise: if only t was supplied, copy to time; vice-versa.
        if self.t is not None and len(self.time) == 0:
            self.time = self.t
        elif self.t is None:
            self.t = self.time
        if self.n_points == 0:
            self.n_points = len(self.time)

    @classmethod
    def from_protocol(cls, bundle: Any) -> ResultBundle:
        """Convert a simulator.solvers.protocol.ResultBundle to this type."""
        signals = []
        for sig in getattr(bundle, "signals", []):
            signals.append(
                SignalArray(
                    name=getattr(sig, "name", f"{sig.block_id}.{sig.port_id}"),
                    block_id=sig.block_id,
                    port_id=sig.port_id,
                    data=sig.data,
                    # Carry metadata if the protocol Signal already has it; else keep defaults.
                    analysis=getattr(sig, "analysis", "transient"),
                    quantity=getattr(sig, "quantity", "dimensionless"),
                    unit=getattr(sig, "unit", ""),
                    domain=getattr(sig, "domain", "time"),
                    swept_param=getattr(sig, "swept_param", None),
                )
            )
        t = getattr(bundle, "t", getattr(bundle, "time", np.empty(0)))
        return cls(
            sim_id=bundle.sim_id,
            t_start=bundle.t_start,
            t_end=bundle.t_end,
            time=t,
            signals=signals,
            n_points=getattr(bundle, "n_points", len(t)),
        )


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------


class ResultWriter:
    """Writes a ResultBundle to the filesystem."""

    def __init__(self, workdir: pathlib.Path) -> None:
        self._workdir = workdir

    def write(
        self,
        bundle: ResultBundle,
        *,
        overwrite: bool = False,
    ) -> pathlib.Path:
        return write(bundle, self._workdir, overwrite=overwrite)


def write(
    bundle: ResultBundle | Any,
    workdir: pathlib.Path,
    *,
    overwrite: bool = False,
) -> pathlib.Path:
    """Write result files and return the directory path.

    Accepts both ``result_writer.ResultBundle`` and
    ``solver.protocol.ResultBundle`` (auto-detected).

    Raises FileExistsError if the sim_id directory already exists and
    overwrite is False.
    """
    # Auto-convert from protocol bundle if needed.
    if not isinstance(bundle, ResultBundle):
        bundle = ResultBundle.from_protocol(bundle)

    result_dir = workdir / "results" / bundle.sim_id
    if result_dir.exists() and not overwrite:
        raise FileExistsError(
            f"Result directory already exists: {result_dir}. Pass overwrite=True to replace it."
        )
    result_dir.mkdir(parents=True, exist_ok=overwrite)

    # BE-52: single HDF5 file replaces time.npy + signals/*.npy.
    write_hdf5(bundle, result_dir / "data.h5")

    signal_entries: list[dict[str, Any]] = []
    for sig in bundle.signals:
        filename = f"{dataset_key(sig.block_id, sig.port_id)}.npy"
        url = f"results/{bundle.sim_id}/signals/{filename}"
        entry: dict[str, Any] = {
            "analysis": sig.analysis,
            "block_id": sig.block_id,
            "domain": sig.domain,
            "dtype": "float32",
            "name": sig.name,
            "port_id": sig.port_id,
            "quantity": sig.quantity,
            "shape": list(sig.data.shape),
            "unit": sig.unit,
            "url": url,
        }
        if sig.swept_param is not None:
            entry["swept_param"] = sig.swept_param
        signal_entries.append(entry)

    manifest: dict[str, Any] = {
        "n_points": bundle.n_points,
        "schema_version": _SCHEMA_VERSION,
        "signals": signal_entries,
        "sim_id": bundle.sim_id,
        "status": "ok",
        "t_end": bundle.t_end,
        "t_start": bundle.t_start,
    }

    # BE-50: attach dc_op_table when present (OP analysis only).
    if bundle.dc_op_table is not None:
        manifest["dc_op_table"] = [
            {
                "node_or_branch": entry.node_or_branch,
                "quantity": entry.quantity,
                "unit": entry.unit,
                "value": entry.value,
            }
            for entry in bundle.dc_op_table
        ]

    # BE-51: attach bode_margins when present (AC analysis only).
    if bundle.bode_margins is not None:
        manifest["bode_margins"] = bundle.bode_margins

    manifest_path = result_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")

    return result_dir
