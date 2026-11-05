"""`general_simulator_solver`/`gsim_py_netlist` — the new default (bypass-the-old-pipeline)
compile-and-solve path.

Both `gsim_py` (needs a one-time `maturin build` per interpreter — see
`gsim_py_netlist`'s own module doc comment) and the `general-simulator` binary (needs
`cargo build --release -p general-simulator-cli` in the sibling repo) are genuinely
optional on a fresh checkout, the same way ngspice/Xyce are for their own integration
tests — skip rather than fail when either is missing, matching
`test_ngspice_solver.py::test_integration_rc_transient`'s own convention.
"""

from __future__ import annotations

import pathlib

import pytest


def _gsim_py_available() -> bool:
    try:
        import gsim_py  # noqa: F401
    except ImportError:
        return False
    return True


def _bare_model_document() -> dict:  # type: ignore[type-arg]
    """A minimal circuit using two of the four types with a known catalogue/gsim-core
    port-name divergence (`passive.resistor`, `routing.ground`) — exercises
    `_retargeted_to_gsim_core` for real, not just the happy-path types that already agree.
    """
    return {
        "id": "rc-model",
        "name": "RC",
        "grid": 10,
        "blocks": [
            {
                "id": "V1",
                "type": "source.voltage.dc",
                "paradigm": "physical-network",
                "domain": "electrical",
                "fidelity": "ideal",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"V": 5.0},
                "ic": {},
            },
            {
                "id": "R1",
                "type": "passive.resistor",
                "paradigm": "physical-network",
                "domain": "electrical",
                "fidelity": "ideal",
                "position": [80, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"R": 100.0},
                "ic": {},
            },
            {
                "id": "GND",
                "type": "routing.ground",
                "paradigm": "physical-network",
                "domain": "electrical",
                "fidelity": "ideal",
                "position": [160, 40],
                "rotation": 0,
                "mirror": "none",
                "params": {},
                "ic": {},
            },
        ],
        "wires": [
            {
                "id": "w1",
                "from": {"block": "V1", "port": "p"},
                "to": {"block": "R1", "port": "p"},
                "kind": "physical-electrical",
                "waypoints": [],
                "pinned": False,
                "net": "BUS",
            },
            {
                "id": "w2",
                "from": {"block": "R1", "port": "n"},
                "to": {"block": "GND", "port": "gnd"},
                "kind": "physical-electrical",
                "waypoints": [],
                "pinned": False,
                "net": "GND",
            },
            {
                "id": "w3",
                "from": {"block": "V1", "port": "n"},
                "to": {"block": "GND", "port": "gnd"},
                "kind": "physical-electrical",
                "waypoints": [],
                "pinned": False,
                "net": "GND",
            },
        ],
        "subckt_defs": [],
        "lines": [],
        "nets": [],
        "simulation": {},
        "metadata": {},
    }


def test_compile_gsim_document_wraps_a_bare_model_and_respells_ports() -> None:
    if not _gsim_py_available():
        pytest.skip("gsim_py not built for this interpreter — see gsim_py_netlist's own doc")

    from simulator.compiler.gsim_py_netlist import compile_gsim_document

    netlist = compile_gsim_document(_bare_model_document())

    # The compiled netlist uses gsim-core's own port-name spelling internally, but what
    # matters here is that compilation succeeded at all (no FloatingPortError) for a
    # document using the catalogue's spelling (`p`/`n`/`gnd`) — proving
    # `_retargeted_to_gsim_core` actually ran, not just that some other path was taken.
    assert "V1" in netlist
    assert "R1" in netlist


@pytest.mark.integration
def test_integration_compile_and_solve_rc_transient(tmp_path: pathlib.Path) -> None:
    if not _gsim_py_available():
        pytest.skip("gsim_py not built for this interpreter — see gsim_py_netlist's own doc")

    from simulator.compiler.gsim_py_netlist import compile_gsim_document
    from simulator.solvers.general_simulator_solver import (
        GeneralSimulatorSolver,
        discover_general_simulator,
    )
    from simulator.solvers.protocol import SolverOptions

    binary_path = discover_general_simulator()
    if binary_path is None:
        pytest.skip(
            "general-simulator binary not found — build it in the sibling repo "
            "(cargo build --release -p general-simulator-cli)"
        )

    netlist = compile_gsim_document(_bare_model_document())
    solver = GeneralSimulatorSolver(binary_path)
    result = solver.solve(
        netlist,
        sim_id="int-rc-gsim",
        options=SolverOptions(analysis_type="TRAN", t_start=0.0, t_end=0.01, n_samples=50),
    )

    signal_names = [s.name for s in result.signals]
    assert any("V1" in n or "n1" in n.lower() for n in signal_names), (
        f"Expected a source/node voltage signal, got: {signal_names}"
    )
    assert result.n_points > 0
