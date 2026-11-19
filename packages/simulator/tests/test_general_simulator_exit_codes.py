"""The engine's exit codes are not a boolean.

`general-simulator`'s `book/dev-guide/src/output-contract.md` §L1:

| code | meaning | is there a result? |
|---|---|---|
| 0 | finished; nothing to report, or warnings only | yes |
| 1 | the run failed -- bad arguments, an unreadable netlist, a solver error | no |
| 2 | finished, and a rule of severity `error` or `fatal` fired | **yes** |
| 3 | a rule ended the run early, cleanly | **yes, up to the stop** |
| 4 | the solved state went non-finite and the run was abandoned | no |

The adapter used to raise on every non-zero code, which discarded the waveform for exactly the
two runs a user most needs to look at -- and made the rules engine working look like the engine
being broken (GLODI-Engineering/omni-schematics#69).

These tests fake the subprocess, because the codes are the contract: driving a real binary can
only produce the codes that binary happens to emit today, and 1 and 4 are awkward to provoke on
purpose. The real-binary cases live in `test_general_simulator_solver.py`.
"""

from __future__ import annotations

import subprocess
from typing import Any

import pytest

from simulator.solvers import general_simulator_solver as gss
from simulator.solvers.protocol import RunOutcome, SimulationError, SolverOptions

#: A two-row CSV the real engine would print for this deck: a header and one sample.
CSV = "t,V(n1),I(V1)\n0.001,5,-0.005\n"

NETLIST = "V1 n1 0 5\nR1 n1 0 1k\n"


def _solver_with_exit(monkeypatch: pytest.MonkeyPatch, code: int, stderr: str = "") -> Any:
    """A solver whose subprocess always exits with `code`, printing `CSV` and `stderr`."""

    def fake_run(cmd: list[str], **_: Any) -> subprocess.CompletedProcess[bytes]:
        return subprocess.CompletedProcess(
            args=cmd,
            returncode=code,
            stdout=CSV.encode(),
            stderr=stderr.encode(),
        )

    monkeypatch.setattr(gss, "run_cancellable", fake_run)
    return gss.GeneralSimulatorSolver(binary_path="/nonexistent/general-simulator")


def _solve(solver: Any) -> Any:
    return solver.solve(
        NETLIST,
        sim_id="exit-codes",
        options=SolverOptions(analysis_type="TRAN", t_start=0.0, t_end=1e-3, n_samples=2),
    )


def test_zero_is_a_completed_run(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _solve(_solver_with_exit(monkeypatch, 0))
    assert bundle.outcome is RunOutcome.COMPLETED
    assert bundle.stopped_by is None
    assert bundle.n_points > 0


def test_two_keeps_the_waveform_and_says_a_rule_fired(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _solve(_solver_with_exit(monkeypatch, 2))
    assert bundle.outcome is RunOutcome.RULE_VIOLATED
    # The point of the issue: the waveform survives. A rule firing is the feature working.
    assert bundle.n_points > 0
    assert [s.name for s in bundle.signals]


def test_three_keeps_the_waveform_up_to_the_stop(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _solve(_solver_with_exit(monkeypatch, 3, stderr="stopped by rule 'R_leg'\n"))
    assert bundle.outcome is RunOutcome.STOPPED_BY_RULE
    assert bundle.n_points > 0
    # No event stream was written by this fake, so the rule's name is unknown rather than
    # guessed out of stderr: the structured stream is the source, and an absent one is absent.
    assert bundle.stopped_by is None


def test_one_is_a_failure_and_keeps_the_engines_own_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    solver = _solver_with_exit(monkeypatch, 1, stderr="error: line 3: unknown device 'Q1'\n")
    with pytest.raises(SimulationError, match="unknown device 'Q1'"):
        _solve(solver)


def test_four_says_the_state_went_non_finite(monkeypatch: pytest.MonkeyPatch) -> None:
    # A user who meets this once needs to know it is divergence, not a crashed process.
    solver = _solver_with_exit(monkeypatch, 4)
    with pytest.raises(SimulationError, match="non-finite"):
        _solve(solver)


def test_four_prefers_the_engines_own_account_when_it_has_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    message = "abandoned at step 412 (t = 4.12e-4 s): 'V(out)' is not a finite number."
    solver = _solver_with_exit(monkeypatch, 4, stderr=message + "\n")
    with pytest.raises(SimulationError, match="step 412"):
        _solve(solver)


def test_an_unknown_code_is_a_failure_that_reports_the_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    solver = _solver_with_exit(monkeypatch, 7)
    with pytest.raises(SimulationError, match="status 7"):
        _solve(solver)
