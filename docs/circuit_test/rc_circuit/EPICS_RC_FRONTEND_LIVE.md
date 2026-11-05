# RC frontend/live follow-up epics (post-milestone)

## FE-67 — Sidebar viewport fit + internal scroll (complete)
- **Goal:** Keep component/library sidebar constrained to browser height and scrollable.
- **Implemented:**
  - `apps/frontend/src/shell/layout.css`
    - `.app-shell` constrained to `100vh` with `overflow: hidden`
    - `.app-main` overflow constrained
    - `.side-bar` and `.side-bar__body` forced to internal scroll behavior
- **Outcome:** screenshots now capture viewport instead of long stretched page caused by sidebar overflow.

## FE-68 — Headless RC frontend capture flow (complete)
- **Goal:** Create RC from frontend hooks, run TRAN/AC/DC from frontend, capture screenshots.
- **Implemented:**
  - `tests/e2e/rc-circuit-headless.spec.ts`
  - Generated screenshots:
    - `frontend_schematic.png`
    - `frontend_tran.png`
    - `frontend_ac.png`
    - `frontend_dc.png`
- **Outcome:** passing Playwright headless scenario (`web-chromium`).

## BE-45 / FE-69 — Live web WS kernel-sidecar RC run (partially implemented, pending)
- **Goal:** End-to-end web frontend → WS kernel-sidecar → solver → waveform fetch in browser.
- **Implemented groundwork:**
  - `apps/frontend/src/ipc/client.ts`
    - handshake support
    - simulate envelope support
    - simulate_result handling
    - waveform fetch implementation from manifest/signal `.npy`
  - `apps/frontend/src/ipc/transport.ts`
    - automatic WS preference when `__KERNEL_PORT__` is injected
  - `apps/kernel-sidecar/src/kernel_sidecar/waveform/slice_server.py`
    - CORS headers for cross-origin browser waveform fetch
  - `tests/e2e/rc-circuit-live.spec.ts` (currently skipped due instability)
- **Open issues to finish epic:**
  1. stabilize WS lifecycle + handshake readiness in browser test harness
  2. ensure consistent simulate/run completion semantics for live web mode
  3. make `rc-circuit-live.spec.ts` deterministic and unskip
