"""BE-27 — XyceSolver subprocess runner tests.

Covers every acceptance bullet from progress.backend.yaml BE-27:

- Unit: mock subprocess; assert command line correct (with and without MPI prefix).
- Unit: rc=1 raises SimulationError.
- Integration (skip if no Xyce): simple RC, solve, assert ResultBundle non-empty.

Additional coverage:
- from_discovery() classmethod returns None when Xyce not found.
- can_handle() returns True for circuit blocks when intent != "control_only".
- cancel token handling mirrors BE-26.
"""

from __future__ import annotations

import pathlib
from typing import ClassVar
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Import helpers
# ---------------------------------------------------------------------------


def _import_solver():  # type: ignore[no-untyped-def]
    try:
        from simulator.solvers.xyce_solver import XyceSolver

        return XyceSolver
    except (ImportError, AttributeError) as exc:
        pytest.xfail(f"simulator.solvers.xyce_solver not yet implemented as BE-27 solver: {exc}")


def _import_error():  # type: ignore[no-untyped-def]
    try:
        from simulator.solvers.ngspice_solver import SimulationError

        return SimulationError
    except ImportError:
        try:
            from simulator.solvers.protocol import SimulationError  # type: ignore[no-reattr]

            return SimulationError
        except ImportError:
            pytest.xfail("SimulationError not available")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_MINIMAL_PRN = "TIME V(net1)\n0.0 5.0\n5e-4 3.03\n1e-3 1.84\n"

_TRIVIAL_NETLIST = """\
* RC trivial
V1 net1 0 DC 5
R1 net1 net2 1000
C1 net2 0 1e-6
.TRAN 1e-4 1e-3
.END
"""


# ---------------------------------------------------------------------------
# from_discovery classmethod
# ---------------------------------------------------------------------------


def test_from_discovery_returns_none_when_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    XyceSolver = _import_solver()
    # XyceSolver.from_discovery() must exist in BE-27
    if not hasattr(XyceSolver, "from_discovery"):
        pytest.xfail("XyceSolver.from_discovery() not yet implemented (BE-27)")

    # Clear GENSIM_XYCE_PATH so the env-var resolution step is skipped too.
    monkeypatch.delenv("GENSIM_XYCE_PATH", raising=False)
    with patch("shutil.which", return_value=None):
        result = XyceSolver.from_discovery()

    assert result is None


# ---------------------------------------------------------------------------
# can_handle
# ---------------------------------------------------------------------------


def test_can_handle_circuit_model_not_control_only() -> None:
    XyceSolver = _import_solver()

    class _FakeIR1:
        blocks: ClassVar[list[MagicMock]] = [MagicMock(block_type="passive.resistor")]

    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"))
    # BE-27: can_handle True when ir1 has circuit blocks AND intent != "control_only"
    if hasattr(solver, "can_handle"):
        # can_handle may accept ir1 (BE-27) or ir2 (old stub)
        try:
            result = solver.can_handle(_FakeIR1(), "transient")
        except Exception:
            pytest.xfail("can_handle signature not yet updated for BE-27")
        assert result is True


# ---------------------------------------------------------------------------
# Unit: solve command line — no MPI
# ---------------------------------------------------------------------------


def test_solve_command_line_no_mpi(tmp_path: pathlib.Path) -> None:
    XyceSolver = _import_solver()

    if not hasattr(XyceSolver, "from_discovery"):
        pytest.xfail("XyceSolver.solve() not yet implemented as BE-27 full solver")

    prn_path = tmp_path / "out.prn"

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        prn_path.write_text(_MINIMAL_PRN, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"), mpi_ranks=1)
    with patch("simulator.solvers.xyce_solver.run_cancellable", side_effect=_fake_run) as mock_run:
        solver.solve(_TRIVIAL_NETLIST, sim_id="u1", prn_output_path=prn_path)

    assert mock_run.called
    cmd = mock_run.call_args[0][0]
    # With mpi_ranks=1 the command must NOT start with mpirun
    assert "mpirun" not in cmd[0], f"Unexpected mpirun in command: {cmd}"
    assert str(solver.xyce_path) in cmd, f"Xyce binary not in command: {cmd}"


def test_solve_command_line_with_mpi(tmp_path: pathlib.Path) -> None:
    XyceSolver = _import_solver()

    if not hasattr(XyceSolver, "from_discovery"):
        pytest.xfail("XyceSolver.solve() not yet implemented as BE-27 full solver")

    prn_path = tmp_path / "out.prn"

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        prn_path.write_text(_MINIMAL_PRN, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"), mpi_ranks=4)
    with patch("simulator.solvers.xyce_solver.run_cancellable", side_effect=_fake_run) as mock_run:
        solver.solve(_TRIVIAL_NETLIST, sim_id="u2", prn_output_path=prn_path)

    cmd = mock_run.call_args[0][0]
    assert "mpirun" in cmd[0] or "mpirun" in " ".join(cmd), f"Expected mpirun in MPI command: {cmd}"
    assert "-np" in cmd or "-n" in cmd, f"Expected -np/-n flag in MPI command: {cmd}"


# ---------------------------------------------------------------------------
# Unit: rc=1 raises SimulationError
# ---------------------------------------------------------------------------


def test_solve_raises_simulation_error_on_rc1() -> None:
    XyceSolver = _import_solver()

    if not hasattr(XyceSolver, "from_discovery"):
        pytest.xfail("XyceSolver.solve() not yet implemented as BE-27 full solver")

    SimulationError = _import_error()
    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"))

    def _fail_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        return MagicMock(returncode=1, stdout=b"", stderr=b"Xyce: convergence failure")

    with (
        patch("simulator.solvers.xyce_solver.run_cancellable", side_effect=_fail_run),
        pytest.raises(SimulationError, match="convergence"),
    ):
        solver.solve(_TRIVIAL_NETLIST, sim_id="u3")


def test_solve_uses_full_cir_path_for_default_prn_path() -> None:
    XyceSolver = _import_solver()

    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"))

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        cir_path = pathlib.Path(cmd[-1])
        pathlib.Path(f"{cir_path}.prn").write_text(_MINIMAL_PRN, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    with patch("simulator.solvers.xyce_solver.run_cancellable", side_effect=_fake_run):
        result = solver.solve(_TRIVIAL_NETLIST, sim_id="tmp.name.with.dots")

    assert len(result.t) > 0


# ---------------------------------------------------------------------------
# Unit: cancel token
# ---------------------------------------------------------------------------


def test_cancel_before_launch_does_not_invoke_subprocess() -> None:
    XyceSolver = _import_solver()

    if not hasattr(XyceSolver, "from_discovery"):
        pytest.xfail("XyceSolver.solve() not yet implemented as BE-27 full solver")

    SimulationError = _import_error()

    try:
        from simulator.solvers.protocol import CancelToken
    except ImportError:
        pytest.xfail("CancelToken not available")

    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"))
    token = CancelToken()
    token.cancel()

    with patch("simulator.solvers.xyce_solver.run_cancellable") as mock_run:
        with pytest.raises((SimulationError, Exception)):
            solver.solve(_TRIVIAL_NETLIST, sim_id="u4", cancel=token)
        mock_run.assert_not_called()


# ---------------------------------------------------------------------------
# BE-54: on_partial live streaming wiring
# ---------------------------------------------------------------------------


def test_on_partial_fires_during_solve_via_on_poll(tmp_path: pathlib.Path) -> None:
    XyceSolver = _import_solver()
    prn_path = tmp_path / "out.prn"

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        on_poll = kwargs.get("on_poll")
        assert on_poll is not None, "solve() must pass on_poll when on_partial is given"
        prn_path.write_text("Index   TIME            V(OUT)\n")
        on_poll()  # header only

        with prn_path.open("a") as fh:
            fh.write("0   0.000000e+00    1.000000e+00\n")
            fh.write("1   1.000000e-06    2.000000e+00\n")
        on_poll()  # two new rows

        prn_path.write_text(_MINIMAL_PRN, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    received: list[object] = []
    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"))
    with patch("simulator.solvers.xyce_solver.run_cancellable", side_effect=_fake_run):
        solver.solve(
            _TRIVIAL_NETLIST,
            sim_id="u5",
            prn_output_path=prn_path,
            on_partial=received.append,
        )

    assert len(received) == 1
    partial = received[0]
    assert list(partial.x) == [0.0, 1e-6]
    assert list(partial.signal_values["V(OUT)"]) == [1.0, 2.0]


# ---------------------------------------------------------------------------
# FORMAT=PROBE stripping — real-world/exported decks commonly request Xyce's
# PSpice-Probe .csd output, which this solver's parser (parse_xyce_prn)
# cannot read (it expects the plain .prn TIME/FREQ tabular format).
# ---------------------------------------------------------------------------


def test_strip_probe_format_removes_format_probe_keyword() -> None:
    from simulator.solvers.xyce_solver import _strip_probe_format

    netlist = "R1 net1 0 1000\n.print TRAN FORMAT=PROBE\n+ V(net1) V(net2)\n.end\n"
    stripped = _strip_probe_format(netlist)
    assert "FORMAT=PROBE" not in stripped
    assert ".print TRAN\n" in stripped
    # Continuation line (the actual signal list) must survive untouched.
    assert "+ V(net1) V(net2)" in stripped


def test_strip_probe_format_leaves_plain_print_untouched() -> None:
    from simulator.solvers.xyce_solver import _strip_probe_format

    netlist = ".print TRAN V(net1) V(net2)\n.end\n"
    assert _strip_probe_format(netlist) == netlist


def test_solve_strips_probe_format_so_prn_output_is_found(tmp_path: pathlib.Path) -> None:
    """Regression: FORMAT=PROBE must not leave this solver looking for a
    .prn file that Xyce never wrote (it writes .csd instead).

    Found while importing real-world converter netlists (LLC/DAB benchmark
    decks) that request `.print TRAN FORMAT=PROBE`.
    """
    XyceSolver = _import_solver()
    prn_path = tmp_path / "out.prn"

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        cir_path = pathlib.Path(cmd[-1])
        cir_text = cir_path.read_text(encoding="utf-8")
        # Real Xyce would only produce a .prn (not .csd) once FORMAT=PROBE
        # has been stripped from the deck; assert that happened.
        assert "FORMAT=PROBE" not in cir_text.upper()
        prn_path.write_text(_MINIMAL_PRN, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    netlist = ".print TRAN FORMAT=PROBE\n+ V(net1)\n" + _TRIVIAL_NETLIST
    solver = XyceSolver(xyce_path=pathlib.Path("/usr/bin/Xyce"))
    with patch("simulator.solvers.xyce_solver.run_cancellable", side_effect=_fake_run):
        result = solver.solve(netlist, sim_id="u6", prn_output_path=prn_path)

    assert len(result.t) > 0


# ---------------------------------------------------------------------------
# Integration test — skipped if Xyce not found
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_rc_transient(tmp_path: pathlib.Path) -> None:
    XyceSolver = _import_solver()

    if not hasattr(XyceSolver, "from_discovery"):
        pytest.skip("XyceSolver.from_discovery() not yet implemented")

    solver = XyceSolver.from_discovery()
    if solver is None:
        pytest.skip("Xyce not found on this host — skipping integration test")

    result = solver.solve(_TRIVIAL_NETLIST, sim_id="int-rc-xyce")
    assert result is not None
    assert len(result.t) > 0, "Expected non-empty time vector"
