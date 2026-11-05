#!/usr/bin/env bash
# Full build: Python wheels for all workspace members + frontend production bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

uv build --all-packages
pnpm --filter @gensim/frontend build
