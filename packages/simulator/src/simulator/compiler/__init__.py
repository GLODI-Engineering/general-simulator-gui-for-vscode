"""simulator.compiler package.

The backend is general-simulator. A document is compiled by gsim-core
through ``gsim_py_netlist``, which asks the engine what each block compiles
to; nothing in this package decides that any more.

This file re-exports module objects for the kernel-sidecar IPC server, which
reaches them as attributes (``from simulator.compiler import gsim_loader``).
Keep it lightweight: module re-exports only, no heavy or optional imports at
import time.
"""

from __future__ import annotations

from . import gsim_loader, gsim_sch_loader

__all__ = [
    "gsim_loader",
    "gsim_sch_loader",
]
