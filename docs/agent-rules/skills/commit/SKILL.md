---
name: commit
description: Gate-checked commit workflow — runs lint and full test suite before staging any files, then creates a conventional-commit message from the diff.
---

# `/commit` — Lint, test, then commit

Use this skill whenever you are about to commit changes — whether you are the
coder-agent, tester-agent, or any other agent role. No agent may attempt a
`git commit` without completing every step below first.

> **Non-negotiable.** This gate applies to every agent, every task, every
> branch. "It's a small change" is not an exception. If a step fails, fix
> the root cause before proceeding. Never use `--no-verify` or skip steps.
> (See architectural invariant #4 in `AGENTS.md`.)

---

## Step 1 — Lint

Run the full linter across the changed languages. All must exit 0.

```bash
# TypeScript / JavaScript
pnpm --filter '@gensim/*' exec biome check --write .

# Python
uv run ruff check --fix .
uv run ruff format .

# Rust (if any .rs files changed)
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
```

If biome or ruff report unfixable errors, fix them manually before continuing.

---

## Step 2 — Type-check

```bash
# TypeScript
pnpm --filter '@gensim/frontend' typecheck
pnpm --filter '@gensim/schemas' typecheck   # if schemas changed

# Python
uv run mypy packages/ apps/
```

All type errors must be resolved before continuing.

---

## Step 3 — Full test suite

Run every test that covers the changed code. When in doubt, run all of them.

```bash
# Unit + integration (TypeScript)
pnpm --filter '@gensim/frontend' test

# Schema codegen / drift checks
pnpm --filter '@gensim/schemas' test

# Python
uv run pytest

# E2E (only when frontend or desktop changed)
pnpm exec playwright test
```

All tests must be green (or legitimately `xfail`) before continuing. If a
test was passing before your change and is now failing, fix it — do not
mark it xfail.

**Tester-agent scaffold carve-out:** When you are the tester-agent committing
new test files (Mode A of `/test-and-progress`), the implementation may not
exist yet. Tests in `tests.paths` may be `xfail` with a concrete reason
(`@pytest.mark.xfail(reason="<epic-id> not yet implemented")`). That is
acceptable — xfail scaffold tests may be committed. What is not acceptable:
tests that *error* (import errors, missing fixtures) or that pass by
coincidence against stub code. Fix errors before committing; let intentional
xfails through.

---

## Step 4 — Review the diff

```bash
git diff --staged   # if already staged
git diff            # unstaged changes
git status
```

Check for:
- accidentally included files (`.env`, large binaries, generated artifacts
  that should be gitignored)
- debug prints, `console.log`, `TODO` comments introduced by you
- leftover merge-conflict markers

---

## Step 5 — Stage selectively

Add specific files. Never use `git add -A` or `git add .` without first
reviewing `git status` output.

```bash
git add path/to/file1 path/to/file2 ...
```

---

## Step 6 — Write the commit message

Follow Conventional Commits (enforced by the `commit-msg` hook):

```
<type>(<scope>): <short imperative summary>

<body — optional, explains WHY not WHAT>
<footer — breaking changes, closes #issue>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`. Append `!` after the type for breaking changes.

Derive the message from the actual diff, not from memory of what you
intended to do.

---

## Step 7 — Commit

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <summary>

<body if needed>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

If the pre-commit hook modifies files (whitespace, end-of-file fixes), it
will exit non-zero. Re-stage the modified files and create a **new** commit —
never `--amend` after a hook failure.

---

## What to do when a gate fails

| Gate | Failure action |
|---|---|
| Lint | Fix the reported lines; do not suppress rules without approval |
| Type-check | Fix the type error; `# type: ignore` requires a comment explaining why |
| Tests | Fix the failing test or the code; do not mark passing tests as xfail |
| Pre-commit hook | Re-stage hook-modified files; create a new commit |
| `commit-msg` hook | Rewrite the message to conform; do not bypass |
