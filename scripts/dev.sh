#!/usr/bin/env bash
# Launch the frontend dev server and kernel sidecar together for local development.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() {
    jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT

uv run --package kernel-sidecar kernel-sidecar &
pnpm --filter @gensim/frontend dev &

wait
