"""Script to generate the reference waveform for the smoke test.

Run once: python tests/backend/fixtures/generate_reference.py
"""

from __future__ import annotations

import pathlib
import sys

# Ensure simulator package is on the path.
repo_root = pathlib.Path(__file__).parents[3]
sys.path.insert(0, str(repo_root / "packages" / "simulator" / "src"))
sys.path.insert(0, str(repo_root / "packages" / "blocks" / "src"))

import numpy as np

from simulator.compiler import gsim_loader, ir1_builder, ir2_lowering, scipy_compiler
from simulator.selection import select_backend
from simulator.solvers.protocol import SolverOptions

FIXTURE_DIR = pathlib.Path(__file__).parent
MODEL_PATH = FIXTURE_DIR / "models" / "step_pid_integrator_scope.gsim"
REFERENCE_PATH = FIXTURE_DIR / "reference" / "step_pid_integrator_scope.npz"


def generate() -> None:
    doc = gsim_loader.load(MODEL_PATH)
    ir1 = ir1_builder.build(doc)
    ir2 = ir2_lowering.lower(ir1)
    compiled = scipy_compiler.compile(ir2)

    options = SolverOptions(t_start=0.0, t_end=10.0, n_samples=3000)
    backend = select_backend(ir2)
    bundle = backend.solve(compiled, (0.0, 10.0), options)

    arrays: dict[str, np.ndarray] = {"time": bundle.t}
    for (block_id, port_id), arr in bundle.signals.items():
        arrays[f"{block_id}__{port_id}"] = arr

    REFERENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez(str(REFERENCE_PATH), **arrays)
    print(f"Reference saved to {REFERENCE_PATH}")
    for key, arr in arrays.items():
        print(f"  {key}: shape={arr.shape}, dtype={arr.dtype}")


if __name__ == "__main__":
    generate()
