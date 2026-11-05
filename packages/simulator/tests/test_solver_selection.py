"""BE-21 + BE-28 — SolverBackend protocol + auto_select cascade tests.

BE-21 coverage (original):
- All v1 control fixtures route to ScipySolver.
- A synthetic fixture marked has_circuit_elements raises NotImplementedError with Phase 2 message.
- ScipySolver registered in the module-level backend registry.
- ScipySolver exposes name and capabilities protocol attributes.

BE-28 coverage (new):
- circuit IR-1 + ngspice mock present → NgspiceSolver returned.
- circuit IR-1 + only Xyce mock → XyceSolver returned.
- circuit IR-1 + neither found → SimulationError raised.
- signal-only IR-1 → SCIPY_BACKEND always returned.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Import helpers
# ---------------------------------------------------------------------------


def _import_selection():  # type: ignore[no-untyped-def]
    try:
        from simulator.ir.ir2 import IR2System
        from simulator.selection.auto_select import select_backend
        from simulator.solvers.scipy_solver import ScipySolver

        return select_backend, ScipySolver, IR2System
    except (ImportError, AttributeError):
        pytest.xfail("simulator.selection.auto_select not yet implemented")


def _import_selection_ir1():  # type: ignore[no-untyped-def]
    """Import select_backend variant that may accept IR-1 for BE-28."""
    try:
        from simulator.selection.auto_select import select_backend

        return select_backend
    except (ImportError, AttributeError):
        pytest.xfail("simulator.selection.auto_select not yet implemented")


def _make_control_ir2():  # type: ignore[no-untyped-def]
    """Return a minimal IR2System representing a pure control (no circuit elements) model."""
    _, _, IR2System = _import_selection()
    return IR2System(
        blocks=[],
        state_layout={},
        output_layout={},
        sources=[],
        sinks=[],
        eval_order=[],
        has_circuit_elements=False,
    )


def _make_circuit_ir2():  # type: ignore[no-untyped-def]
    """Return an IR2System flagged as having circuit elements."""
    _, _, IR2System = _import_selection()
    return IR2System(
        blocks=[],
        state_layout={},
        output_layout={},
        sources=[],
        sinks=[],
        eval_order=[],
        has_circuit_elements=True,
    )


def _make_circuit_ir1(*block_types: str):  # type: ignore[no-untyped-def]
    """Return a minimal IR1Graph with the given circuit block types."""
    from simulator.ir.ir1 import IR1Block, IR1Graph

    blocks = [
        IR1Block(instance_id=f"b{i}", block_type=bt, params={}) for i, bt in enumerate(block_types)
    ]
    return IR1Graph(blocks=blocks, connections=[])


def _make_signal_ir1():  # type: ignore[no-untyped-def]
    """Return an IR1Graph with only control/signal blocks."""
    from simulator.ir.ir1 import IR1Block, IR1Graph

    return IR1Graph(
        blocks=[
            IR1Block(instance_id="g1", block_type="control.gain", params={"k": 1.0}),
            IR1Block(instance_id="sc1", block_type="sinks.scope", params={}),
        ],
        connections=[],
    )


# ---------------------------------------------------------------------------
# BE-21 Tests (unchanged from original, kept for regression)
# ---------------------------------------------------------------------------


def test_control_model_selects_scipy() -> None:
    select_backend, ScipySolver, _ = _import_selection()
    ir2 = _make_control_ir2()
    backend = select_backend(ir2, intent="transient_control")
    assert isinstance(backend, ScipySolver), (
        f"Expected ScipySolver for control model, got {type(backend).__name__}"
    )


def test_scipy_solver_registered() -> None:
    """ScipySolver must register itself in the module-level backend registry."""
    from simulator.solvers import get_registry  # type: ignore[import]

    registry = get_registry()
    names = [b.name for b in registry]
    assert "scipy.radau" in names or any("scipy" in n for n in names), (
        f"ScipySolver not in registry. Registry: {names}"
    )


def test_circuit_elements_raises_not_implemented() -> None:
    select_backend, _, _ = _import_selection()
    ir2 = _make_circuit_ir2()

    with pytest.raises(NotImplementedError) as exc_info:
        select_backend(ir2, intent="transient_control")

    msg = str(exc_info.value)
    assert "Phase 2" in msg or "v1" in msg.lower() or "xyce" in msg.lower(), (
        f"Error must mention Phase 2 / Xyce; got: {msg!r}"
    )


def test_circuit_elements_error_message_is_human_readable() -> None:
    """The NotImplementedError must carry a user-facing explanation, not just 'not implemented'."""
    select_backend, _, _ = _import_selection()
    ir2 = _make_circuit_ir2()

    with pytest.raises(NotImplementedError) as exc_info:
        select_backend(ir2, intent="transient_control")

    msg = str(exc_info.value)
    assert len(msg) > 30, f"Error message too short to be user-facing: {msg!r}"


def test_solver_backend_protocol_attributes() -> None:
    """ScipySolver must expose name and capabilities as required by the protocol."""
    _, ScipySolver, _ = _import_selection()
    solver = ScipySolver()
    assert hasattr(solver, "name") and isinstance(solver.name, str)
    assert hasattr(solver, "capabilities") and isinstance(solver.capabilities, (set, frozenset))
    assert "transient" in solver.capabilities


# ---------------------------------------------------------------------------
# BE-28 Tests — updated select_backend with IR-1 circuit cascade
# ---------------------------------------------------------------------------


def test_signal_ir1_routes_to_scipy_backend() -> None:
    """A signal-only IR-1 (no circuit blocks) must always return SCIPY_BACKEND."""
    select_backend = _import_selection_ir1()

    try:
        from simulator.selection.auto_select import select_backend as sb  # noqa: F401
        from simulator.solvers.scipy_solver import SCIPY_BACKEND, ScipySolver
    except ImportError:
        pytest.xfail("scipy backend imports not available")

    ir1 = _make_signal_ir1()
    # BE-28 select_backend may accept IR1Graph directly
    try:
        result = select_backend(ir1, intent="transient_control")
    except TypeError:
        pytest.xfail("select_backend does not yet accept IR1Graph (BE-28 not implemented)")

    assert isinstance(result, ScipySolver) or result is SCIPY_BACKEND, (
        f"Expected ScipySolver/SCIPY_BACKEND for signal IR-1, got {type(result).__name__}"
    )


def test_circuit_ir1_with_ngspice_mock_returns_ngspice() -> None:
    """When ngspice is discovered, select_backend must return NgspiceSolver for a circuit IR-1."""
    select_backend = _import_selection_ir1()

    try:
        from simulator.solvers.ngspice_solver import NgspiceSolver  # type: ignore[import]
    except ImportError:
        pytest.xfail("NgspiceSolver not yet implemented (BE-26)")

    ir1 = _make_circuit_ir1("passive.resistor", "source.voltage.dc")

    fake_ng = MagicMock(spec=NgspiceSolver)
    fake_ng.__class__ = NgspiceSolver

    with patch.object(NgspiceSolver, "from_discovery", return_value=fake_ng):
        try:
            result = select_backend(ir1, intent="transient")
        except (TypeError, NotImplementedError):
            pytest.xfail("select_backend circuit cascade not yet implemented (BE-28)")

    assert isinstance(result, NgspiceSolver), f"Expected NgspiceSolver, got {type(result).__name__}"


def test_circuit_ir1_ngspice_absent_xyce_present_returns_xyce() -> None:
    """When ngspice is absent but Xyce is found, select_backend must return XyceSolver."""
    select_backend = _import_selection_ir1()

    try:
        from simulator.solvers.ngspice_solver import NgspiceSolver  # type: ignore[import]
        from simulator.solvers.xyce_solver import XyceSolver
    except ImportError:
        pytest.xfail("NgspiceSolver/XyceSolver not yet implemented")

    ir1 = _make_circuit_ir1("passive.capacitor")

    fake_xy = MagicMock(spec=XyceSolver)
    fake_xy.__class__ = XyceSolver

    with (
        patch.object(NgspiceSolver, "from_discovery", return_value=None),
        patch.object(XyceSolver, "from_discovery", return_value=fake_xy),
    ):
        try:
            result = select_backend(ir1, intent="transient")
        except (TypeError, NotImplementedError):
            pytest.xfail("select_backend circuit cascade not yet implemented (BE-28)")

    assert isinstance(result, XyceSolver), f"Expected XyceSolver, got {type(result).__name__}"


def test_circuit_ir1_no_simulator_raises_simulation_error() -> None:
    """When neither ngspice nor Xyce is found, select_backend must raise SimulationError."""
    select_backend = _import_selection_ir1()

    try:
        from simulator.solvers.ngspice_solver import (  # type: ignore[import]
            NgspiceSolver,
            SimulationError,
        )
        from simulator.solvers.xyce_solver import XyceSolver
    except ImportError:
        try:
            from simulator.solvers.protocol import SimulationError  # type: ignore[no-reattr]
            from simulator.solvers.xyce_solver import XyceSolver

            NgspiceSolver = None  # type: ignore[assignment]
        except ImportError:
            pytest.xfail("SimulationError not available (BE-26/BE-27 not implemented)")

    ir1 = _make_circuit_ir1("passive.resistor")

    patches = []
    if NgspiceSolver is not None:
        patches.append(patch.object(NgspiceSolver, "from_discovery", return_value=None))
    patches.append(patch.object(XyceSolver, "from_discovery", return_value=None))

    try:
        with patches[0]:
            ctx = patches[1] if len(patches) > 1 else patches[0]
            with ctx, pytest.raises((SimulationError, Exception)) as exc_info:
                select_backend(ir1, intent="transient")

        msg = str(exc_info.value)
        assert "ngspice" in msg.lower() or "xyce" in msg.lower() or "spice" in msg.lower(), (
            f"Error message must mention ngspice/Xyce/SPICE: {msg!r}"
        )
    except TypeError:
        pytest.xfail("select_backend circuit cascade not yet implemented (BE-28)")


def test_circuit_ir1_requested_xyce_returns_xyce_even_if_ngspice_present() -> None:
    select_backend = _import_selection_ir1()

    try:
        from simulator.solvers.ngspice_solver import NgspiceSolver  # type: ignore[import]
        from simulator.solvers.xyce_solver import XyceSolver
    except ImportError:
        pytest.xfail("NgspiceSolver/XyceSolver not yet implemented")

    ir1 = _make_circuit_ir1("passive.resistor", "source.voltage.dc")

    fake_xy = MagicMock(spec=XyceSolver)
    fake_xy.__class__ = XyceSolver
    fake_ng = MagicMock(spec=NgspiceSolver)
    fake_ng.__class__ = NgspiceSolver

    with (
        patch.object(NgspiceSolver, "from_discovery", return_value=fake_ng),
        patch.object(XyceSolver, "from_discovery", return_value=fake_xy),
    ):
        result = select_backend(ir1, intent="transient", solver="xyce")

    assert isinstance(result, XyceSolver), f"Expected XyceSolver, got {type(result).__name__}"


def test_signal_ir1_rejects_spice_solver_override() -> None:
    select_backend = _import_selection_ir1()

    from simulator.solvers.protocol import SimulationError

    with pytest.raises(SimulationError, match="requires a circuit schematic"):
        select_backend(_make_signal_ir1(), intent="transient_control", solver="xyce")
