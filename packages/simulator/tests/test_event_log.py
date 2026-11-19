"""`simulator.postprocess.event_log` — reading back what a run found.

The record shapes are `general-simulator`'s `book/dev-guide/src/output-contract.md` §L3. The
cases below are that document's own example records, so a drift in the contract shows up here
rather than as an empty findings list in the UI.
"""

from __future__ import annotations

import pathlib

from simulator.postprocess.event_log import (
    SEVERITY_ORDER,
    EventLog,
    parse_event_log_text,
    read_event_log,
)

#: The contract's own example event, verbatim from §L3.
INSTANT = (
    '{"record": "event", "time": 4.9992e-4, "step": 4999, "step_time": 5.0e-4, '
    '"rule": "deadtime", "target": "lega", "kind": "instant", "severity": "warning", '
    '"action": "console", "value": 0.0, "limit": 1.0e-7, "unit": "s", '
    '"detail": "lega_high, lega_low"}'
)
ENTER = (
    '{"record": "event", "time": 9.8e-4, "step": 980, "step_time": 9.8e-4, "rule": "isat", '
    '"target": "I(L1)", "kind": "enter", "severity": "error", "action": "log", '
    '"value": 3.1, "limit": 3.0, "unit": "A"}'
)
LEAVE = (
    '{"record": "event", "time": 1.09e-3, "step": 1090, "step_time": 1.1e-3, "rule": "isat", '
    '"target": "I(L1)", "kind": "leave", "severity": "error", "action": "log", '
    '"value": 3.0, "limit": 3.0, "unit": "A", "duration": 1.1e-4, "peak": 3.65, '
    '"peak_time": 1.0e-3}'
)
SUMMARY = (
    '{"record": "summary", "rule": "isat", "target": "I(L1)", "entries": 1, "filtered": 2, '
    '"suppressed": 0, "instants": 0, "missing_samples": 0, "total_time": 1.1e-4, '
    '"worst_value": 3.65, "worst_time": 1.0e-3}'
)


def test_an_instant_event_carries_both_times_and_its_unit() -> None:
    log = parse_event_log_text(INSTANT)
    (event,) = log.events
    assert event.rule == "deadtime"
    assert event.target == "lega"
    assert event.kind == "instant"
    assert event.severity == "warning"
    assert event.action == "console"
    # `time` is interpolated and `step_time` is not. A displayer marks at `time` and seeks to
    # `step`, so both have to survive the read -- see the contract's rule 1.
    assert event.time == 4.9992e-4
    assert event.step_time == 5.0e-4
    assert event.step == 4999
    assert event.unit == "s"
    assert event.detail == "lega_high, lega_low"
    assert event.duration is None, "an instant has no interval"


def test_a_violation_is_two_records_and_the_leave_carries_the_measurement() -> None:
    log = parse_event_log_text(f"{ENTER}\n{LEAVE}")
    enter, leave = log.events
    assert (enter.kind, leave.kind) == ("enter", "leave")
    # The contract's rule 2: an enter has no duration because it is not known yet.
    assert enter.duration is None
    assert enter.peak is None
    assert leave.duration == 1.1e-4
    assert leave.peak == 3.65
    assert leave.peak_time == 1.0e-3


def test_a_summary_keeps_the_three_states_a_quiet_rule_can_be_in() -> None:
    log = parse_event_log_text(SUMMARY)
    (summary,) = log.summaries
    assert summary.rule == "isat"
    assert summary.entries == 1
    # `filtered` above zero means a hold time is hiding something; `missing_samples` above zero
    # means the rule was blind. Neither is "passed", which is why both travel.
    assert summary.filtered == 2
    assert summary.missing_samples == 0
    assert summary.worst_value == 3.65


def test_the_shape_is_read_from_record_not_from_which_fields_are_present() -> None:
    # A summary line that happens to carry a `time` is still a summary.
    log = parse_event_log_text('{"record": "summary", "rule": "r", "time": 1.0}')
    assert log.summaries and not log.events


def test_a_malformed_line_is_skipped_rather_than_raised() -> None:
    # A diagnostic channel must not be able to fail a run that otherwise succeeded.
    log = parse_event_log_text(f"{INSTANT}\nnot json at all\n\n{SUMMARY}")
    assert len(log.events) == 1
    assert len(log.summaries) == 1
    assert log.unreadable_lines == 1


def test_a_record_shape_this_reader_does_not_know_is_counted_not_fatal() -> None:
    log = parse_event_log_text('{"record": "something_new", "rule": "r"}')
    assert not log.events and not log.summaries
    assert log.unreadable_lines == 1


def test_worst_severity_uses_the_engines_own_order() -> None:
    assert SEVERITY_ORDER == ("info", "warning", "error", "fatal")
    log = parse_event_log_text(f"{INSTANT}\n{ENTER}")  # warning, then error
    assert log.worst_severity == "error"
    assert parse_event_log_text("").worst_severity is None


def test_a_run_with_no_rules_writes_no_file_and_that_is_an_empty_log() -> None:
    missing = pathlib.Path("/nonexistent/never-written.events.jsonl")
    log = read_event_log(missing)
    assert log == EventLog()
    assert not log, "an empty log is falsey, so a caller can ask `if log:`"


def test_a_real_file_round_trips(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "run.events.jsonl"
    path.write_text(f"{ENTER}\n{LEAVE}\n{SUMMARY}\n", encoding="utf-8")
    log = read_event_log(path)
    assert len(log.events) == 2
    assert len(log.summaries) == 1
    assert log.unreadable_lines == 0
