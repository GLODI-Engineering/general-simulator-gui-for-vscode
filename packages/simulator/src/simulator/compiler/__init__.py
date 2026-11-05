"""simulator.compiler package.

This package is imported by the kernel-sidecar IPC server, which expects
selected submodules to be available as attributes (e.g. ``from simulator.compiler
import gsim_loader``).

Keep this file lightweight: it re-exports module objects rather than importing
large optional dependencies at import time.
"""

from __future__ import annotations

# Re-export commonly used compiler stages as modules for backwards compatibility.
from . import gsim_loader, gsim_sch_loader, ir1_builder, ir2_lowering, scipy_compiler

__all__ = [
    "gsim_loader",
    "gsim_sch_loader",
    "ir1_builder",
    "ir2_lowering",
    "scipy_compiler",
]
