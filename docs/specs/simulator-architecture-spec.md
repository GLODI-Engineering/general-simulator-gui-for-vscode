# Simulator Architecture Specification

**Project:** Power Electronics & Control System Simulator  
**Version:** 0.1 — Initial Architecture  
**Status:** Draft  
**Last updated:** May 2026

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Core Requirements](#2-core-requirements)
3. [Frontend Stack](#3-frontend-stack)
4. [Block Diagram Editor](#4-block-diagram-editor)
5. [Python Kernel & Workspace](#5-python-kernel--workspace)
6. [IPC Protocol](#6-ipc-protocol)
7. [Simulation Data & LOD Serving](#7-simulation-data--lod-serving)
8. [Compute Architecture](#8-compute-architecture)
9. [Deployment Contexts](#9-deployment-contexts)
10. [Design Principles Derived from Prior Art](#10-design-principles-derived-from-prior-art)
11. [Open Questions](#11-open-questions)

---

## 1. Project Vision

A cross-platform power electronics and control system simulator that bridges the gap between:

- **SPICE-class tools** (a reference SPICE, Xyce): real device physics, switching transients, but no control blocks
- **Block diagram tools** (the commercial block-diagram and piecewise-linear simulators): clean control integration, but ideal switches only

The software allows users to work at the abstraction level they need and **synthesize downward** on demand:

| Level | Representation | Example |
|---|---|---|
| 0 — Behavioral | Math blocks | TF block, PID block, hysteresis block |
| 1 — Functional | Averaged models | Averaged switch model, CCM/DCM |
| 2 — Circuit (ideal) | Ideal switches + passives | a commercial piecewise-linear simulator-style |
| 3 — Circuit (physical) | Real device models + parasitics | a reference SPICE-style |

### Key differentiators

- Python as the scripting language (not a numerical computing environment)
- Live workspace with numpy/scipy/matplotlib/PyTorch access
- Web-first, natively cross-platform without UI rewrites
- Paid web SaaS tier with GPU/HPC backend — same frontend, different kernel URL
- Multi-level abstraction with automated downward synthesis (PID → op-amp circuit, TF → Sallen-Key filter, ideal switch → real MOSFET + gate drive)

---

## 2. Core Requirements

### Functional

- Block diagram editor for control and power electronics design
- Mixed-level simulation: behavioral blocks + circuit elements in the same model
- DAE/ODE solver backend (stiff, suitable for power electronics: Radau, Sundials IDA)
- Python workspace: persistent namespace, numpy/scipy/matplotlib access
- Live variable inspection (workspace panel)
- Waveform viewer with pan/zoom, signal selection
- Synthesis: automatically convert behavioral blocks to circuit implementations
- FMI 3.0 export/import

### Non-functional

- Runs on: Linux, macOS, Windows (desktop), and all major web browsers
- Web version must be the primary development target — desktop wraps it
- Simulation results up to multiple GB must be navigable without full transfer to the frontend
- 1000+ concurrent web users without data transfer bottleneck
- Sub-50ms canvas interaction latency (optimistic UI, async validation)

---

## 3. Frontend Stack

### Decision: React + TypeScript

**Rationale:** Web-first design target with full reuse on desktop via Tauri. React is the only frontend ecosystem mature enough to credibly serve browser, desktop, and (if needed) mobile without rewriting the UI layer.

The inverse of the a numerical computing environment Online failure mode: a numerical computing environment was designed for desktop and ported to web as an afterthought, producing a buggy, slow web experience. This project is designed web-first and wrapped for desktop.

### Core dependencies

| Layer | Technology | Rationale |
|---|---|---|
| UI framework | React 18 + TypeScript | Web-first, Tauri reuse, large ecosystem |
| Block diagram canvas | React Flow | Port-typed nodes, edge routing, MIT licensed |
| Styling | Tailwind CSS | Consistent across contexts, no runtime overhead |
| State management | Zustand | Lightweight, works well for diagram state |
| Code editor | Monaco Editor | VS Code engine, Python syntax + autocomplete |
| Waveform viewer | uPlot | 10M points rendered in <50ms; far faster than Plotly for dense data |
| Desktop wrapper | Tauri | Rust shell, ~10MB binary, Python sidecar support |
| Build tool | Vite | Fast HMR, good TypeScript support |

### Why uPlot over Plotly for waveforms

Plotly is general-purpose and carries significant overhead. uPlot is purpose-built for high-frequency time-series rendering. At 10 million points already in memory, uPlot renders in under 50ms. For simulation waveforms this difference is material — the bottleneck must always be network latency, never rendering.

### Why Tauri over Electron for desktop

- Binary size: ~10MB (Tauri) vs ~150MB (Electron)
- Tauri uses the OS's native WebView — no bundled Chromium
- Tauri supports spawning a Python sidecar process natively
- Rust-based shell provides better system integration and security
- The React frontend is identical — Tauri is purely a wrapper

---

## 4. Block Diagram Editor

### Canvas approach

Standard DOM rendering is not suitable for a schematic editor at scale. The editor uses **React Flow** with a custom node renderer. React Flow handles:

- Pan and zoom
- Custom node types (blocks with typed ports)
- Edge routing (orthogonal — see design principle #5)
- Selection, copy/paste, undo/redo

### Port system

Ports are typed. Compatible types are enforced on connection draw — not at simulation time. This is the primary UX lesson from OpenModelica: discovering a type mismatch at run time breaks engineering flow.

Port types include: `signal` (scalar), `signal[n]` (vector), `electrical` (voltage/current pair), `thermal`, `mechanical`. Domain mismatches are shown immediately as a colored warning on the wire.

### Model representation

The canonical representation of a diagram is a **JSON graph** — not a binary format, not XML. Human-readable, diffable in Git, lossless on round-trip between canvas and file.

```
{
  "blocks": [
    { "id": "pid_1", "type": "PID", "position": [120, 80], "params": {...} },
    ...
  ],
  "connections": [
    { "id": "w1", "from": "pid_1:output", "to": "plant_1:input" },
    ...
  ]
}
```

The canvas is a rendering of this JSON. The JSON is the source of truth. Any operation (drag, connect, parameter edit) mutates the JSON first; the canvas re-renders from it. There is no separate "diagram state" and "model state" that can desync — this was the source of OpenModelica's silent data-loss bugs.

### Interaction latency requirement

All canvas operations (drag, connect, delete, undo) must feel instantaneous. Target: <16ms (one frame). Solver validation and compilation happen asynchronously in the background and surface results via non-blocking indicators. The user is never blocked waiting for a compiler round-trip to complete a canvas action.

---

## 5. Python Kernel & Workspace

### Design goal

Give users the a numerical computing environment workspace experience with Python as the language. After every code execution, the user sees their live variables — name, type, shape, preview value — in a persistent panel. This state survives across executions within a session.

### What the kernel provides

- Persistent Python namespace across executions (`np`, `plt`, `scipy` pre-imported)
- Full numpy, scipy, matplotlib, pandas, sympy access
- PyTorch (CPU on desktop; GPU on paid cloud tier)
- User can `pip install` additional packages in the desktop version
- Matplotlib figures are captured and rendered in the UI automatically
- `print()` output streams in real time (not buffered to end of execution)

### Desktop kernel: Python sidecar process

On desktop (Tauri), a real CPython process is spawned as a sidecar at app launch. This provides:

- 100% native Python — no WASM limitations
- Full PyTorch support including CUDA if the user has a GPU
- Access to the user's filesystem for saving/loading data
- Ability to use the user's existing Python environment or a bundled one

The sidecar is a long-lived process. The kernel namespace persists for the duration of the session. Restarting the kernel clears the namespace.

### Web kernel: hybrid approach

| Feature | Mechanism | Coverage |
|---|---|---|
| numpy, scipy, sympy, pandas | Pyodide (CPython in WASM) | ✓ Full |
| matplotlib | Pyodide | ✓ Static figures |
| PyTorch CPU | Not available in WASM | ✗ |
| PyTorch GPU | Server-side execution | ✓ (paid tier) |
| Heavy simulation runs | Server-side kernel | ✓ (paid tier) |
| User pip install | Not available in browser sandbox | ✗ |

The web free tier runs Pyodide in the browser. The paid tier connects to a cloud kernel (same IPC protocol, different WebSocket URL) with full Python and GPU access. The frontend does not change between these modes.

---

## 6. IPC Protocol

### Transport: JSON-RPC over local WebSocket

The React frontend communicates with the Python sidecar via WebSocket on `localhost`. This choice is deliberate:

- WebSocket is bidirectional — Python can push without being asked (workspace updates, plot-ready events)
- Multiplexed — many concurrent requests on one connection
- Identical protocol for local sidecar and cloud kernel — only the URL changes
- No native IPC library dependency; the frontend is pure web code

The sidecar binds to `127.0.0.1` only. Never `0.0.0.0`. A random port is chosen at launch and injected into the frontend via `window.__KERNEL_PORT__`. A one-time token handshake prevents other local processes from connecting.

### Message envelope

Every message in both directions shares this structure:

```typescript
interface Message {
  id:      string;    // UUID — correlates request to response and streaming chunks
  type:    MessageType;
  payload: unknown;
}
```

### Message types

**Frontend → Python:**

| Type | Purpose |
|---|---|
| `execute` | Run Python code in the namespace |
| `execute_cancel` | Cancel a running execution by id |
| `workspace_get` | Fetch a variable's full value (on user click) |
| `kernel_restart` | Clear namespace, restart kernel |
| `completion_request` | Autocomplete at cursor position |

**Python → Frontend:**

| Type | Purpose |
|---|---|
| `execute_result` | Final result of an execution (status, plots, workspace snapshot) |
| `execute_stream` | stdout/stderr chunk — streamed in real time |
| `execute_error` | Exception with traceback |
| `workspace_update` | Namespace changed — push lightweight snapshot |
| `workspace_value` | Response to `workspace_get` — full variable value |
| `plot_ready` | A matplotlib figure is ready — base64 PNG |
| `completion_reply` | Autocomplete results |
| `kernel_status` | `idle` / `busy` / `restarting` |

### Streaming stdout

`print()` output and simulation progress appear in real time. The sidecar intercepts stdout with a custom `io.TextIOBase` subclass that fires `execute_stream` messages per chunk. The frontend routes each chunk by `id` to the correct output panel.

### Workspace snapshot (lightweight)

After every execution, the sidecar sends a workspace snapshot. This is **metadata only** — never full array values:

```json
[
  { "name": "V_out", "type": "ndarray", "dtype": "float32", "shape": [10000000], "preview": "[0.0, 1.23, 4.56, ...]" },
  { "name": "Kp",    "type": "float",   "value": 2.5 },
  { "name": "t",     "type": "ndarray", "dtype": "float64", "shape": [10000000], "preview": "[0.0, 1e-8, 2e-8, ...]" }
]
```

Full variable values are fetched lazily when the user clicks a variable in the workspace panel (`workspace_get`).

### Binary transfer for large arrays

JSON is not used for numerical array transfer. When a full array is requested:

- The sidecar sends a binary WebSocket frame
- First 128 bytes: JSON metadata header (id, dtype, shape), padded with spaces
- Remaining bytes: raw array data (`array.tobytes()`)
- Frontend detects binary frames by `event.data instanceof ArrayBuffer` and parses header + typed array separately

This reduces transfer size 5–10x versus JSON for float data.

### Execution is non-blocking

The sidecar runs the event loop on the main thread and executes Python code in a `ThreadPoolExecutor`. This means:

- The WebSocket remains responsive during long simulations
- Cancellation messages are received and acted on while code runs
- Multiple lightweight requests (completion, workspace_get) can be served during a heavy simulation

---

## 7. Simulation Data & LOD Serving

### The problem

A 100ms simulation at 10ns step size produces 10 million time points. With 20 signals at float64, that is approximately 1.6 GB of raw data per simulation run. This cannot transit a network naively, and cannot be rendered naively in a browser.

The frontend has at most ~3000 pixels of horizontal resolution. Sending 10 million points to render 3000 pixels is pure waste.

### Storage format: HDF5

Simulation results are stored as HDF5 files. HDF5 is a chunked, indexed, compressed data store with **partial I/O** — a time slice can be read from a 2 GB file in microseconds without loading the rest into memory.

Critical HDF5 write settings:

- **Chunk size:** 10,000 points per dataset chunk (= 100 microseconds of simulation at 10ns step)
- **Compression:** gzip level 1 (HDF5 filter 1). LZF was chosen here originally on the belief that it was faster for read-heavy work; measured on 2,000,000 samples × 6 signals of a hard-switching converter (64 MB raw), it is not — gzip 1 is smaller (2.36 MB vs 3.13 MB), faster to write (95 ms vs 131 ms) and nearly twice as fast to read (70 ms vs 129 ms). LZF is also h5py's own filter (ID 32000), not part of the HDF5 standard, so nothing else — MATLAB, the Rust `hdf5` crate, a WebAssembly reader — can decompress those datasets. A result file no other tool can open is a cache, not a result file. Higher gzip levels buy ratio with write time (level 4: 1.93 MB but 246 ms), which is the wrong trade on the simulation's hot path.
- **Shuffle filter:** enabled (HDF5 filter 2) — and it is doing most of the work, not the compressor. It transposes the bytes of each float so the near-constant exponent bytes sit together, giving the deflate stream something to find: the same data compresses 33× with it and 5.5× without.
- **dtype:** `float32` not `float64` — halves size; sufficient precision for waveform display

File structure:

```
simulation_{id}.h5
├── metadata/          t_start, t_end, step, solver, signals list
├── time               float64[N] — master time axis
├── signals/
│   ├── V_out          float32[N]
│   ├── I_L            float32[N]
│   └── ...
└── lod/
    ├── V_out/
    │   ├── level_1    float32[N/100]   — 1µs resolution
    │   ├── level_2    float32[N/1000]  — 10µs resolution
    │   └── level_3    float32[N/10000] — 100µs resolution
    └── I_L/
        └── ...
```

### LOD pyramid

A level-of-detail pyramid is computed once immediately after simulation completes and stored alongside raw data. Each level decimates by a factor of 100× using **min/max envelope decimation** — not mean decimation. Mean averaging eliminates transient spikes that engineers need to see. Min/max interleaving preserves all peaks regardless of decimation factor.

| Level | Factor | Resolution | Size (20 signals) |
|---|---|---|---|
| 0 (raw) | 1× | 10ns | ~1.6 GB — never transferred |
| 1 | 100× | 1µs | ~16 MB |
| 2 | 1000× | 10µs | ~1.6 MB |
| 3 | 10000× | 100µs | ~160 KB — initial page load |

### LOD query API

The frontend never requests raw data. It requests a time-windowed slice at a resolution matched to its pixel budget:

```
GET /results/{sim_id}/signals
    ?signals=V_out,I_L
    &t_start=0.000010
    &t_end=0.000500
    &max_points=3000
```

The server:
1. Computes what fraction of the total simulation the window covers
2. Selects the coarsest LOD level that still provides ≥ `max_points` resolution for that window
3. Binary-searches the HDF5 index for the start/end chunk indices
4. Reads only the relevant chunks (partial I/O — microseconds for a 200KB result from a 2GB file)
5. Returns binary float32 arrays (not JSON) over HTTP

Approximate transfer per interaction: 50–500 KB. At 1000 concurrent users all panning simultaneously: ~200 MB/s — manageable for standard cloud infrastructure.

### Client-side prefetching

The waveform viewer prefetches adjacent time windows in the background while the user views the current window. When the user pans, the data is already in a client-side LRU cache. Pan operations feel instantaneous. This is the same principle as video streaming read-ahead buffers.

### First paint strategy

When a simulation completes, Level 3 (coarsest, ~160 KB) is served immediately — arrives in milliseconds, renders the full waveform overview. As the user zooms in, finer levels load on demand. The user perceives "instant load." Full raw data is never transferred.

### Storage infrastructure

```
[Worker completes simulation]
        ↓
[Write HDF5 + build LOD pyramid]   (seconds, post-simulation)
        ↓
[Upload to object storage]         S3 / GCS / self-hosted MinIO
        ↓
[Waveform API]
   — Streams HDF5 chunks directly from object storage via byte-range requests
   — OR caches HDF5 files on local NVMe, evicts by LRU
```

HDF5 supports direct byte-range HTTP reads via the ROS3 driver (`h5py` with `driver="ros3"`). This eliminates the need for a local cache: chunks are read directly from S3 without downloading the full file. Latency is 50–200ms per chunk — acceptable with prefetching.

---

## 8. Compute Architecture

### Solver backend

The simulation engine is a Python-based DAE/ODE solver pipeline:

```
[Block diagram JSON]
        ↓
[Front-end compiler]
   — MNA stamping for circuit elements
   — State-space realization for TF blocks
   — Equation generation for behavioral blocks (PID, hysteresis, LUT, etc.)
        ↓
[Symbolic processor]
   — BLT sorting (computation order)
   — Index reduction (Pantelides algorithm for high-index DAEs)
   — Tearing (break algebraic loops)
   — Switch mode enumeration (precompute MNA matrix per switch configuration)
        ↓
[Solver]   (interchangeable backend)
   — scipy Radau (default, stiff ODE)
   — Sundials IDA (DAE, via CasADi or pySundials)
   — Julia DifferentialEquations.jl (future — via subprocess or FMI)
        ↓
[HDF5 result writer + LOD builder]
```

### Job queue architecture

Simulations are CPU-bound and potentially long-running (minutes). They are never executed synchronously in the API request handler.

```
[Frontend]  →  POST /simulate  →  [FastAPI]  →  [Job Queue: Redis + Celery]
                                                          ↓
                                               [Worker pool: CPU nodes]
                                                          ↓
                                               [HDF5 on object storage]
                                                          ↓
[Frontend]  ←  WebSocket progress  ←  [FastAPI]
            ←  LOD slice requests  ←  [Waveform API]
```

The user submits a job, receives a `job_id` immediately, and watches progress via WebSocket. The WebSocket connection to the API server is separate from the worker — the worker pushes progress to Redis pub/sub, the API server relays it to the frontend.

Workers scale horizontally. Adding GPU nodes for PyTorch-based simulation is a matter of adding worker instances with GPU access to the pool.

### GPU acceleration (paid tier)

The paid web tier provides access to GPU-attached workers. Use cases:

- PyTorch-based neural network control (reinforcement learning controllers, neural ODEs)
- Parallelized Monte Carlo / parameter sweep simulations
- Large-scale system simulations (grid models, multi-converter systems)

The frontend is unaware of whether the backend worker has a GPU. The API abstracts this. Paid tier users are routed to GPU-capable workers by the job queue.

---

## 9. Deployment Contexts

### Context A: Desktop (Tauri + Python sidecar)

```
[Tauri binary]
  ├── [React UI — WebView]
  │     ├── Block diagram editor
  │     ├── Monaco code editor
  │     ├── Workspace panel
  │     └── Waveform viewer
  └── [Python sidecar process — 127.0.0.1:random_port]
        ├── Kernel (persistent namespace)
        ├── Solver backend
        └── Local HDF5 result storage
```

- Fully offline-capable
- Full Python: numpy, scipy, matplotlib, PyTorch (CPU + CUDA if GPU present)
- User can install their own packages
- Results stored locally; user owns their data
- Tauri injects kernel port into frontend at launch
- Sidecar killed when app closes

### Context B: Web — Free Tier

```
[Browser]
  ├── [React UI]
  └── [Pyodide — CPython in WASM]
        ├── numpy, scipy, sympy, pandas ✓
        ├── matplotlib (static) ✓
        └── PyTorch ✗
```

- No installation
- Python runs client-side in WASM — no server cost per user for computation
- Limited to Pyodide-compatible packages
- Simulation results stored in browser IndexedDB for the session
- For heavy simulations: submit to cloud worker queue (metered)

### Context C: Web — Paid Tier

```
[Browser — React UI]
        ↓ WebSocket (same protocol as desktop sidecar)
[Cloud kernel — FastAPI]
        ↓
[Worker pool — CPU + GPU nodes]
        ↓
[Object storage — HDF5 results]
        ↓
[Waveform LOD API]
        ↑
[Browser — React UI waveform viewer]
```

- Full Python, full PyTorch, GPU acceleration
- Results stored in cloud, accessible across sessions and devices
- Same frontend code as Context A and B — only `KERNEL_URL` changes
- Metered by compute time and GPU-hours

### The unifying principle

The React frontend is **context-unaware**. It connects to a WebSocket kernel URL. That URL resolves to:

- A local sidecar port on desktop
- A cloud kernel endpoint on the paid web tier
- A Pyodide in-browser emulation layer on the free web tier

Zero frontend code changes between these contexts. This is the architectural property that makes the paid SaaS upgrade path low-risk: the product already works in the browser.

---

## 10. Design Principles Derived from Prior Art

These are lessons from the failure modes of OpenModelica, Xcos, Scilab, and a numerical computing environment Online, incorporated as hard requirements.

**1. Optimistic canvas.** All canvas operations are instantaneous. Solver validation is asynchronous. The user is never blocked by a compiler round-trip to complete a diagram edit.

**2. Single source of truth.** The block diagram JSON is the canonical model. The canvas renders from it. There is no separate GUI state and model state. Desyncing is architecturally impossible.

**3. Inline type validation.** Port compatibility is checked on wire draw. Type mismatches surface as visual indicators on the wire, not as cryptic solver errors at run time.

**4. Orthogonal wire routing.** All wires are horizontal/vertical segments. Routing is deterministic and stable across save/load cycles. Diagonal wires are not permitted. This matches the conventional editor's routing and is what engineers expect.

**5. Hierarchy with breadcrumbs.** Composite blocks are navigable by double-click. The current hierarchy level is shown in a breadcrumb bar. Edits inside a subsystem propagate immediately.

**6. Search-first block library.** Fuzzy search is the primary way to find blocks. The category tree is secondary. Recently used blocks are surfaced at the top.

**7. Never transfer full simulation data.** The waveform viewer operates on LOD slices. Raw data never transits the network to the frontend. First paint uses the coarsest LOD level (kilobytes).

**8. Python, not a numerical computing environment.** The scripting language is Python throughout. numpy, scipy, and matplotlib are first-class citizens. The workspace panel reflects the Python namespace, not a proprietary variable system.

**9. Same UI for all platforms.** The React frontend is the product. Desktop and web are deployment targets, not separate products. Features developed for web are available on desktop immediately.

**10. Human-readable errors.** All solver and compiler errors are translated into actionable, user-facing language before display. Raw Fortran stack traces and Modelica compiler output are never shown to the user directly.

---

## 11. Open Questions

These architectural decisions are deferred — they need more information or prototyping before committing.

| Question | Options | Blocker |
|---|---|---|
| Primary solver library | scipy Radau vs Sundials IDA vs Julia DifferentialEquations.jl | Performance benchmarking on stiff power electronics DAEs |
| React Flow scalability ceiling | React Flow handles ~500–1000 nodes; Konva.js scales further | Need to determine expected model size for target users |
| Pyodide vs server-side for web free tier | Pyodide has no server cost but limits packages; server has full Python but costs money per user | Business model decision |
| Python bundling strategy for desktop | Bundle full CPython (150MB) vs detect user's Python vs uv-managed venv | Installer UX tradeoff |
| Device model library format | Native .lib SPICE compatibility vs custom format | Scope of Level 3 (physical circuit) simulation |
| Switch event / zero-crossing detection | State-machine enumeration vs event detection in solver | Core solver architecture — needs prototyping |
| Synthesis rule engine | Hard-coded rules vs constraint solver | Scope of synthesis feature at MVP |
| FMI 3.0 priority | Import only vs export only vs both | User research: is FMI an MVP requirement or a later addition? |

---

*This document reflects architectural decisions made through May 2026. It should be treated as a living document — update version and date on any structural change.*
