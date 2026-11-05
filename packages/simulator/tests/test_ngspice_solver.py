"""BE-26 — NgspiceSolver subprocess runner tests.

Covers every acceptance bullet from progress.backend.yaml BE-26:

- Unit: mock subprocess.run rc=0 + write fixture raw file → ResultBundle returned.
- Unit: mock rc=1 → SimulationError raised with stderr content.
- Unit: discover_ngspice() returns None when PATH mocked empty.
- Integration (skip if no ngspice): write trivial RC netlist, solve, assert V(net1) present.
"""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Import helpers
# ---------------------------------------------------------------------------


def _import_solver():  # type: ignore[no-untyped-def]
    try:
        from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

        return NgspiceSolver, discover_ngspice
    except (ImportError, AttributeError) as exc:
        pytest.xfail(f"simulator.solvers.ngspice_solver not yet implemented: {exc}")


def _import_error():  # type: ignore[no-untyped-def]
    try:
        from simulator.solvers.ngspice_solver import SimulationError

        return SimulationError
    except ImportError:
        # Fallback — may live in a shared module
        try:
            from simulator.solvers.protocol import SimulationError  # type: ignore[no-reattr]

            return SimulationError
        except ImportError:
            pytest.xfail("SimulationError not yet implemented")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_MINIMAL_RAW = """\
Title: unit-test
No. Points: 3
No. Variables: 2
Variables:
\t0\ttime\ttime
\t1\tV(net1)\tvoltage
Values:
0\t0.0
\t5.0
1\t5e-4
\t3.03
2\t1e-3
\t1.84
"""

_TRIVIAL_NETLIST = """\
* RC trivial
V1 net1 0 DC 5
R1 net1 net2 1000
C1 net2 0 1e-6
.TRAN 1e-4 1e-3
.END
"""


# ---------------------------------------------------------------------------
# Unit: discover_ngspice
# ---------------------------------------------------------------------------


def test_discover_ngspice_returns_none_when_path_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    _NgspiceSolver, discover_ngspice = _import_solver()
    # Clear GENSIM_NGSPICE_PATH so the env-var resolution step is skipped too.
    monkeypatch.delenv("GENSIM_NGSPICE_PATH", raising=False)
    with patch("shutil.which", return_value=None):
        result = discover_ngspice()
    assert result is None, f"Expected None when ngspice not on PATH, got {result!r}"


def test_discover_ngspice_returns_path_when_found(tmp_path: pathlib.Path) -> None:
    _NgspiceSolver, discover_ngspice = _import_solver()
    fake_ng = tmp_path / "ngspice"
    fake_ng.write_text("#!/bin/sh\necho 'ngspice 41'\nexit 0\n")
    fake_ng.chmod(0o755)

    with patch("shutil.which", return_value=str(fake_ng)), patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout=b"ngspice 41", stderr=b"")
        result = discover_ngspice()

    assert result is not None
    assert isinstance(result, pathlib.Path)


# ---------------------------------------------------------------------------
# Unit: solve — success path (subprocess mocked)
# ---------------------------------------------------------------------------


def test_solve_returns_result_bundle_on_rc0(tmp_path: pathlib.Path) -> None:
    NgspiceSolver, _ = _import_solver()

    raw_path = tmp_path / "out.raw"

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        # Write the fixture raw file so parse_ngspice_raw can read it
        raw_path.write_text(_MINIMAL_RAW, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    solver = NgspiceSolver(ngspice_path=pathlib.Path("/usr/bin/ngspice"))
    with patch("simulator.solvers.ngspice_solver.run_cancellable", side_effect=_fake_run):
        result = solver.solve(_TRIVIAL_NETLIST, sim_id="u1", raw_output_path=raw_path)

    assert result is not None
    assert len(result.t) == 3
    signal_names = [s.name for s in result.signals]
    assert "V(net1)" in signal_names


def test_solve_raises_simulation_error_on_rc1(tmp_path: pathlib.Path) -> None:
    NgspiceSolver, _ = _import_solver()
    SimulationError = _import_error()

    solver = NgspiceSolver(ngspice_path=pathlib.Path("/usr/bin/ngspice"))

    def _fail_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        return MagicMock(returncode=1, stdout=b"", stderr=b"Error: node not found")

    with (
        patch("simulator.solvers.ngspice_solver.run_cancellable", side_effect=_fail_run),
        pytest.raises(SimulationError, match="node not found"),
    ):
        solver.solve(_TRIVIAL_NETLIST, sim_id="u2")


def test_solve_simulation_error_contains_stderr() -> None:
    NgspiceSolver, _ = _import_solver()
    SimulationError = _import_error()

    solver = NgspiceSolver(ngspice_path=pathlib.Path("/usr/bin/ngspice"))
    stderr_msg = "fatal: singular matrix at t=0.0"

    def _fail_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        return MagicMock(returncode=2, stdout=b"", stderr=stderr_msg.encode())

    with (
        patch("simulator.solvers.ngspice_solver.run_cancellable", side_effect=_fail_run),
        pytest.raises(SimulationError) as exc_info,
    ):
        solver.solve(_TRIVIAL_NETLIST, sim_id="u3")

    assert stderr_msg in str(exc_info.value)


# ---------------------------------------------------------------------------
# Unit: cancel token
# ---------------------------------------------------------------------------


def test_cancel_before_launch_raises(tmp_path: pathlib.Path) -> None:
    NgspiceSolver, _ = _import_solver()
    SimulationError = _import_error()

    try:
        from simulator.solvers.protocol import CancelToken
    except ImportError:
        pytest.xfail("CancelToken not available")

    solver = NgspiceSolver(ngspice_path=pathlib.Path("/usr/bin/ngspice"))
    token = CancelToken()
    token.cancel()

    with patch("simulator.solvers.ngspice_solver.run_cancellable") as mock_run:
        with pytest.raises((SimulationError, Exception)):
            solver.solve(_TRIVIAL_NETLIST, sim_id="u4", cancel=token)
        # run_cancellable should NOT have been called (cancelled before launch)
        mock_run.assert_not_called()


# ---------------------------------------------------------------------------
# BE-54: on_partial live streaming wiring
# ---------------------------------------------------------------------------


def test_on_partial_fires_during_solve_via_on_poll(tmp_path: pathlib.Path) -> None:
    """solve() must tail the growing raw file through run_cancellable's on_poll hook."""
    NgspiceSolver, _ = _import_solver()

    raw_path = tmp_path / "out.raw"
    header = (
        "Title: t\nPlotname: Transient Analysis\nFlags: real\n"
        "No. Variables: 2\nNo. Points: 0\nVariables:\n\t0\ttime\ttime\n"
        "\t1\tv(out)\tvoltage\nBinary:\n"
    )

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        on_poll = kwargs.get("on_poll")
        raw_path.write_bytes(header.encode("ascii"))
        assert on_poll is not None, "solve() must pass on_poll when on_partial is given"
        on_poll()  # header only — no points yet

        import struct

        with raw_path.open("ab") as fh:
            fh.write(struct.pack("<dd", 0.0, 1.0))
            fh.write(struct.pack("<dd", 1e-6, 2.0))
        on_poll()  # two new points now available

        # Mirrors real ngspice: "No. Points:" is a placeholder while running
        # and gets patched to the true count once the file is finalized —
        # same byte length so binary offsets are unaffected.
        raw_path.write_bytes(raw_path.read_bytes().replace(b"No. Points: 0", b"No. Points: 2"))
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    received: list[object] = []
    solver = NgspiceSolver(ngspice_path=pathlib.Path("/usr/bin/ngspice"))
    with patch("simulator.solvers.ngspice_solver.run_cancellable", side_effect=_fake_run):
        solver.solve(
            _TRIVIAL_NETLIST,
            sim_id="u5",
            raw_output_path=raw_path,
            on_partial=received.append,
        )

    assert len(received) == 1
    partial = received[0]
    assert list(partial.x) == [0.0, 1e-6]
    assert list(partial.signal_values["v(out)"]) == [1.0, 2.0]


def test_on_partial_omitted_does_not_pass_on_poll(tmp_path: pathlib.Path) -> None:
    """When on_partial is not given, solve() must not force an on_poll hook."""
    NgspiceSolver, _ = _import_solver()

    raw_path = tmp_path / "out.raw"

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        assert kwargs.get("on_poll") is None
        raw_path.write_text(_MINIMAL_RAW, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    solver = NgspiceSolver(ngspice_path=pathlib.Path("/usr/bin/ngspice"))
    with patch("simulator.solvers.ngspice_solver.run_cancellable", side_effect=_fake_run):
        solver.solve(_TRIVIAL_NETLIST, sim_id="u6", raw_output_path=raw_path)


# ---------------------------------------------------------------------------
# Embedded .control block stripping — real-world imported netlists commonly
# carry their own "run; write <relative-path>; quit" script, which ngspice
# batch mode (-b) executes and which otherwise silently writes to that
# literal path instead of the -r <resolved_raw_path> this solver depends on.
# ---------------------------------------------------------------------------

_NETLIST_WITH_CONTROL_BLOCK = """\
* has its own control block, like many real-world/exported decks
R1 net1 0 1000
V1 net1 0 DC 5
.tran 1e-4 1e-3

.control
set filetype=ascii
run
write some/relative/path.raw v(net1)
quit
.endc

.end
"""


def test_strip_control_blocks_removes_control_endc_region() -> None:
    from simulator.solvers.ngspice_solver import _strip_control_blocks

    stripped = _strip_control_blocks(_NETLIST_WITH_CONTROL_BLOCK)
    assert ".control" not in stripped.lower()
    assert ".endc" not in stripped.lower()
    assert "write" not in stripped.lower()
    # The rest of the deck must survive untouched.
    assert "R1 net1 0 1000" in stripped
    assert ".tran 1e-4 1e-3" in stripped
    assert ".end" in stripped


def test_solve_ignores_netlists_own_control_block_write_target(tmp_path: pathlib.Path) -> None:
    """Regression: a deck's own `write <relative-path>` must not shadow -r.

    Found while importing real-world converter netlists (DAB/LLC benchmark
    decks) that each carry their own .control/write script. Before the fix,
    solve() would look for raw_output_path and find nothing, since ngspice
    (mocked here to mirror real -b behavior) only "wrote" to the deck's own
    relative path.
    """
    NgspiceSolver, _ = _import_solver()

    raw_path = tmp_path / "out.raw"
    written_cir_text: dict[str, str] = {}

    def _fake_run(cmd, **kwargs):  # type: ignore[no-untyped-def]
        cir_path = pathlib.Path(cmd[cmd.index("-a") + 1])
        written_cir_text["text"] = cir_path.read_text(encoding="utf-8")
        # Real ngspice -b would only honor -r once the deck's own .control
        # block has been stripped; simulate that here by writing to -r's
        # target exactly when the deck no longer contains a control block.
        assert ".control" not in written_cir_text["text"].lower()
        raw_path.write_text(_MINIMAL_RAW, encoding="utf-8")
        return MagicMock(returncode=0, stdout=b"", stderr=b"")

    solver = NgspiceSolver(ngspice_path=pathlib.Path("/usr/bin/ngspice"))
    with patch("simulator.solvers.ngspice_solver.run_cancellable", side_effect=_fake_run):
        result = solver.solve(_NETLIST_WITH_CONTROL_BLOCK, sim_id="u7", raw_output_path=raw_path)

    assert len(result.t) == 3


# ---------------------------------------------------------------------------
# Integration test — skipped if ngspice not found
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_rc_transient(tmp_path: pathlib.Path) -> None:
    NgspiceSolver, discover_ngspice = _import_solver()

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(_TRIVIAL_NETLIST, sim_id="int-rc")

    signal_names = [s.name for s in result.signals]
    assert "V(net1)" in signal_names or any("net1" in n for n in signal_names), (
        f"Expected a V(net1) signal, got: {signal_names}"
    )
