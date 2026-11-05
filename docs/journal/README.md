# Agent work journal

A running, chronological log of multi-session agent work on this repo —
one level more concrete than commit messages, one level less formal than
`docs/decisions/`. Its job is **session-to-session continuity**: when a
new session starts cold, read the most recent entries here before
re-deriving context from `git log`.

Each entry answers: what was asked, what was found, what was done, what's
left. Append, don't rewrite history. Newest entry on top of its month
file.

For durable architectural rationale, write a `docs/decisions/NNN-*.md`
instead and link it from here. For a reusable bug fix with a repro, use
`/record-gotcha` and link it. This file is for "what happened and in what
order," not "why we chose X over Y" (that's a decision doc) or "how to
avoid bug Y again" (that's a gotcha).

## Update after every commit — not only when asked

Write a journal entry for **every commit made to this repo**, immediately
after making it — not batched at the end of a session, and not only when
the user explicitly asks for a journal update. The user asking is a
reminder for entries that slipped, not the trigger. The goal is a
complete record of everything done, in commit order, so that debugging
weeks later ("why does this behave this way, what changed and why") is
fast instead of requiring a `git log` archaeology dig.

One entry per commit is the default; a single entry may cover several
commits only when they're trivially small and part of one indivisible
step (e.g. a commit plus its immediate typo-fix amend). When in doubt,
write separate entries.

## Undoing or amending a commit

If a commit is reverted, amended, force-pushed over, or otherwise undone,
**do not edit or delete the journal entry that described it.** Write a
new entry describing the undo/change, and reference the original entry
by its header (e.g. "reverts the 2026-07-29 16:02 entry's fix" — link to
it, same month file with `[16:02 entry](#2026-07-29-1602-title-slug)`, or
across month files with `[2026-07-29 16:02 in 2026-07.md](2026-07.md#...)`).
The old entry stays exactly as written, describing what was true and done
at that time. The journal is an append-only log of what happened, not a
snapshot of current truth — that distinction is what makes it useful for
debugging regressions later.

## One file per month

Entries live in `docs/journal/YYYY-MM.md`, one file per calendar month —
this keeps any single file from growing unbounded and slow to read/grep
as the project accumulates sessions.

- Before writing an entry, check today's actual month (see "Dating
  entries" below). If `docs/journal/YYYY-MM.md` for the current month
  doesn't exist yet, create it — copy the structure of the most recent
  month file (just the `# Journal — YYYY-MM` header, nothing else) and
  add a row to the index below.
- Never append a new month's entries into an old month's file, and never
  split a single month's entries across two files.
- Old month files are not archived or deleted — they stay in
  `docs/journal/` permanently as the historical record. Never rewrite a
  past month's entries except to fix a factual error.
- This file (`README.md`) never accumulates entries itself — it only
  holds the rules and the index. Keep it short.

## Index

Newest month first.

- [2026-09](2026-09.md) — current
- [2026-08](2026-08.md)
- [2026-07](2026-07.md)

## Dating entries

Never trust an ambient "today's date" (or time) from conversation
context/system-reminders for an entry header, or for deciding which
month file to write into — it has been observed to drift or be flat
wrong in this environment (see `2026-07.md`'s 2026-07-29 15:03 entry for
a concrete example: three commits in one continuous work stream carried
three different dates — 2026-07-10, 2026-07-11, 2026-07-14 — while the
actual date at commit time, checked independently, was later than all of
them). Always get the real date **and time** yourself before writing or
dating an entry, or deciding which month file it belongs in:

```bash
date '+%Y-%m-%d %H:%M'
# or
python3 -c "from datetime import datetime; print(datetime.now().strftime('%Y-%m-%d %H:%M'))"
```

Use that value verbatim as the entry header (`## YYYY-MM-DD HH:MM —
Title`) and to pick the month file (`YYYY-MM.md`). If it disagrees with a
date/time mentioned elsewhere in the conversation, trust the command
output, not the conversation.

## How to use this file (for future sessions)

- Open the index above, pick the newest month file, and read its top
  entry first — it's the most recent state of truth.
- If you're picking up unfinished work, check that entry's "What's left"
  section, then cross-check against `progress.frontend.yaml` /
  `progress.backend.yaml` epic `status:` fields directly (the journal can
  drift; the progress files are the source of truth for what's actually
  done).
- Append a new entry after every commit (see "Update after every commit"
  above), in the current month's file (creating it first if this is the
  month's first entry — see "One file per month" above). Don't edit past
  entries except to fix factual errors — this is a log, not a living
  doc; an undone/reverted/amended commit gets its own new entry (see
  "Undoing or amending a commit" above), never an edit to the old one.
