#!/usr/bin/env bash
# Architectural-invariant checks. Run by CI on every PR and locally via
# `./scripts/check-invariants.sh` or the `/check-architecture` skill.
#
# Each check is intentionally a coarse grep. The full rationale and the
# narrow form of each rule live in:
#     docs/agent-rules/architecture-invariants.md
#
# Adding a new invariant: add a section in that doc first, then add a
# `check` call here.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

violations=0

# check NAME DESCRIPTION COMMAND...
#   COMMAND succeeds (exit 0) when it FINDS a violation.
#   We invert: success of the grep = failure of the invariant.
check() {
    local name="$1"; shift
    local description="$1"; shift

    if output=$("$@" 2>/dev/null); then
        printf "  ✗ %-32s %s\n" "$name" "$description"
        # Show the offending matches indented under the failure.
        echo "$output" | sed 's/^/      /'
        violations=$((violations + 1))
    else
        printf "  ✓ %-32s\n" "$name"
    fi
}

printf "Architectural invariants:\n\n"

# -----------------------------------------------------------------------------
# 1. Tpetra, not Epetra.
#    Epetra was removed from Trilinos end of 2025. Allow comments and docs
#    mentioning Epetra (e.g. migration notes) — only block include/import.
#    See: docs/agent-rules/architecture-invariants.md#tpetra
# -----------------------------------------------------------------------------
check "no-epetra" \
    "Epetra is retired; use Tpetra + Kokkos + Belos" \
    grep -rEn \
        --include='*.cpp' --include='*.hpp' --include='*.h' \
        --include='*.cc' --include='*.cxx' --include='*.py' \
        '(^#include[[:space:]]*[<"][Ee]petra|^[[:space:]]*from[[:space:]]+[Ee]petra|^[[:space:]]*import[[:space:]]+[Ee]petra)' \
        packages apps

# -----------------------------------------------------------------------------
# 2. Optimistic canvas — no synchronous awaits on solver/compiler.
#    See: docs/agent-rules/architecture-invariants.md#optimistic-canvas
# -----------------------------------------------------------------------------
check "canvas-non-blocking" \
    "Canvas must not synchronously await solver/compiler/kernel" \
    grep -rEn \
        --include='*.ts' --include='*.tsx' \
        '(await[[:space:]]+(compile|solverCall|runSimulation|runSim)|blockOnSolver|synchronousCompile)' \
        apps/frontend/src/canvas

# -----------------------------------------------------------------------------
# 3. Smooth component models only.
#    Only checks the templates/ subtree; user blocks may use external
#    function blocks with internal discrete behavior.
#    See: docs/agent-rules/architecture-invariants.md#smooth-models
# -----------------------------------------------------------------------------
check "no-piecewise-templates" \
    "Component equation templates must be smooth" \
    grep -rEni \
        --include='*.py' --include='*.yaml' --include='*.yml' \
        '(piecewise|region_switch|case[[:space:]]+region|if[[:space:]]+region_|Heaviside)' \
        packages/components/src/components/templates

# -----------------------------------------------------------------------------
# 4. No hook bypass in scripts or CI.
#    See: docs/agent-rules/architecture-invariants.md#no-no-verify
# -----------------------------------------------------------------------------
check "no-hook-bypass" \
    "scripts/ and workflows/ must not bypass hooks" \
    grep -rEn \
        --include='*.sh' --include='*.yml' --include='*.yaml' \
        --exclude='check-invariants.sh' \
        '(--no-verify|--no-gpg-sign|SKIP=|HUSKY=0)' \
        scripts .github/workflows

# -----------------------------------------------------------------------------

printf "\n"
if [ "$violations" -gt 0 ]; then
    printf "✗ %d invariant(s) violated. See docs/agent-rules/architecture-invariants.md\n" "$violations"
    exit 1
fi

printf "✓ All architectural invariants pass.\n"
