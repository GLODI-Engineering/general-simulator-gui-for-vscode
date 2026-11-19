"""The engine's rule-event stream, read back from the JSONL file it writes.

`general-simulator` reports what a run *found* -- a rating exceeded, a dead time too short, a
volt-second balance drifting -- as an event stream beside the waveform, one JSON object per
line. Until this module existed the GUI asked for no such file and the engine wrote it into a
temporary directory that was deleted with the run, so every finding of every run was discarded
(GLODI-Engineering/omni-schematics#68).

The record shapes are `general-simulator`'s `book/dev-guide/src/output-contract.md` §L3. Two
decisions from that contract are load-bearing here and are the reason this is a module rather
than three lines in the solver:

* **Discriminate on `record`, never on which fields are present.** Every line carries
  `"record": "event"` or `"record": "summary"` as its first field precisely so a reader does
  not have to guess from a missing `duration`.
* **`time` is not `step_time`.** `time` is interpolated to where the quantity actually crossed
  the limit; `step_time` is the solver's own boundary. A displayer puts its marker at `time`
  and seeks to `step`. Both are carried so the consumer can do that without re-deriving
  anything.

A malformed line is skipped with a log line rather than raised: a diagnostic channel must not
be able to fail a run that otherwise succeeded.
"""

from __future__ import annotations

import json
import logging
import pathlib
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

#: Severities, weakest first -- the engine's own order (`gsim_rules::Severity`), so a consumer
#: can compare them without inventing a ranking.
SEVERITY_ORDER: tuple[str, ...] = ("info", "warning", "error", "fatal")


@dataclass(frozen=True)
class RuleEvent:
    """One `"record": "event"` line: an edge of a violation, or an instant finding."""

    rule: str
    target: str
    kind: str  # "enter" | "leave" | "instant"
    severity: str  # "info" | "warning" | "error" | "fatal"
    action: str  # what was *done*, which is not always what the rule asked for
    time: float  # interpolated crossing time -- where a marker goes
    step: int  # the solver step it was noticed in -- where a seek goes
    step_time: float  # the step's own boundary time, before interpolation
    value: float
    limit: float
    unit: str = ""
    #: On a `leave` only: the interval that just ended.
    duration: float | None = None
    peak: float | None = None
    peak_time: float | None = None
    #: Set when the run ended with the condition still true, so `duration` is a lower bound.
    truncated: bool = False
    #: Which components are responsible, when the rule spans several.
    detail: str = ""


@dataclass(frozen=True)
class RuleSummary:
    """One `"record": "summary"` line: how a rule fared over the whole run.

    `entries == 0` is not "passed": `missing_samples` above zero means the rule was partly or
    wholly blind, and `filtered` above zero means a hold time is hiding something. The contract
    is explicit that a quiet rule, a blind rule and a suppressed rule are three different
    states, so all three counts travel.
    """

    rule: str
    target: str = ""
    entries: int = 0
    filtered: int = 0
    suppressed: int = 0
    instants: int = 0
    missing_samples: int = 0
    total_time: float = 0.0
    worst_value: float | None = None
    worst_time: float | None = None
    shortest_deadtime: float | None = None
    severity: str = ""


@dataclass
class EventLog:
    """Everything one run reported, in the order the engine wrote it."""

    events: list[RuleEvent] = field(default_factory=list)
    summaries: list[RuleSummary] = field(default_factory=list)
    #: Lines that could not be read. Kept as a count rather than dropped silently, so a
    #: consumer can say "3 records were unreadable" instead of showing a short list as complete.
    unreadable_lines: int = 0

    def __bool__(self) -> bool:
        return bool(self.events or self.summaries)

    @property
    def worst_severity(self) -> str | None:
        """The highest severity any event reached, or `None` when nothing was reported."""
        reached = [e.severity for e in self.events if e.severity in SEVERITY_ORDER]
        if not reached:
            return None
        return max(reached, key=SEVERITY_ORDER.index)


def _as_float(raw: object, default: float = 0.0) -> float:
    """A JSON value as a float, or `default`.

    Lenient on purpose: a record whose `value` arrived as a string is still a record worth
    showing, and a reader of a diagnostic stream that raises on one odd field is worse than
    one that carries a default.
    """
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _as_optional_float(raw: object) -> float | None:
    """Like [`_as_float`], but `None` means the field was absent -- which is information.

    A `duration` of `None` is "this is an enter, the interval is not over"; a `duration` of
    `0.0` is a measured zero. Collapsing the two would lose the distinction the contract draws.
    """
    if raw is None:
        return None
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _as_int(raw: object, default: int = 0) -> int:
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def parse_event_log_text(text: str, *, source: str = "<text>") -> EventLog:
    """Parse the JSONL body of an event log.

    Unknown `record` values are skipped the same way a malformed line is: a future engine may
    add a third shape, and a reader from this version must not fail on it.
    """
    log = EventLog()
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            record = json.loads(stripped)
        except json.JSONDecodeError:
            log.unreadable_lines += 1
            logger.warning("%s:%d is not JSON, skipped: %r", source, number, stripped[:120])
            continue
        if not isinstance(record, dict):
            log.unreadable_lines += 1
            logger.warning("%s:%d is not a JSON object, skipped", source, number)
            continue

        shape = record.get("record")
        if shape == "event":
            log.events.append(
                RuleEvent(
                    rule=str(record.get("rule", "")),
                    target=str(record.get("target", "")),
                    kind=str(record.get("kind", "")),
                    severity=str(record.get("severity", "")),
                    action=str(record.get("action", "")),
                    time=_as_float(record.get("time")),
                    step=_as_int(record.get("step")),
                    step_time=_as_float(record.get("step_time")),
                    value=_as_float(record.get("value")),
                    limit=_as_float(record.get("limit")),
                    unit=str(record.get("unit", "")),
                    duration=_as_optional_float(record.get("duration")),
                    peak=_as_optional_float(record.get("peak")),
                    peak_time=_as_optional_float(record.get("peak_time")),
                    truncated=bool(record.get("truncated", False)),
                    detail=str(record.get("detail", "")),
                )
            )
        elif shape == "summary":
            log.summaries.append(
                RuleSummary(
                    rule=str(record.get("rule", "")),
                    target=str(record.get("target", "")),
                    entries=_as_int(record.get("entries")),
                    filtered=_as_int(record.get("filtered")),
                    suppressed=_as_int(record.get("suppressed")),
                    instants=_as_int(record.get("instants")),
                    missing_samples=_as_int(record.get("missing_samples")),
                    total_time=_as_float(record.get("total_time")),
                    worst_value=_as_optional_float(record.get("worst_value")),
                    worst_time=_as_optional_float(record.get("worst_time")),
                    shortest_deadtime=_as_optional_float(record.get("shortest_deadtime")),
                    severity=str(record.get("severity", "")),
                )
            )
        else:
            log.unreadable_lines += 1
            logger.warning(
                "%s:%d has record=%r, which this reader does not know; skipped",
                source,
                number,
                shape,
            )
    return log


def read_event_log(path: pathlib.Path) -> EventLog:
    """Read an event log, or return an empty one.

    **A run with no rules writes no file at all**, and that is an empty log rather than an
    error -- the common case, and the reason this returns instead of raising.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return EventLog()
    except OSError as exc:
        logger.warning("could not read the event log at %s: %s", path, exc)
        return EventLog()
    return parse_event_log_text(text, source=str(path))
