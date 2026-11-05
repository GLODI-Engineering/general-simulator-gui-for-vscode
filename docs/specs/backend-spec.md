# Backend Specification — `general-simulator` v1

**Status:** Draft for implementation
**Scope:** `apps/kernel-sidecar/` (the Python kernel process) +
`packages/simulator/` (compiler + IR + solvers) +
`packages/blocks/src/blocks/**/equations.py` (block equation templates).
The frontend is out of scope here — see
[`frontend-spec.md`](./frontend-spec.md).
**v1 cutoff:** kernel-sidecar that satisfies the frontend's IPC
contract end-to-end for control-block models, using **scipy** as the
sole solver. Xyce wiring is a future plug-in point only, with the
path-discovery story specified so it lands cleanly when the
component library (semiconductors) ships.

**Authoritative cross-references (do not duplicate):**

| Topic | Source of truth |
|---|---|
| Architectural invariants | [`AGENTS.md`](../../AGENTS.md) + [`simulator-architecture-spec.md`](./simulator-architecture-spec.md) §10 |
| Frontend IPC envelope | [`simulator-architecture-spec.md`](./simulator-architecture-spec.md) §6 + [`frontend-spec.md`](./frontend-spec.md) §15 |
| File format (`.gsim`) | [`frontend-spec.md`](./frontend-spec.md) §16 + `packages/schemas/definitions/model/gsim.schema.json` |
| Block metadata contract | [`packages/schemas/definitions/blocks/README.md`](../../packages/schemas/definitions/blocks/README.md) |
| IR-1 / IR-2 design | [`pipeline_IR_design.md`](./pipeline_IR_design.md) |
| Adaptive solver roadmap | [`adaptive_simulation_backend_idea.md`](./adaptive_simulation_backend_idea.md) |

---

## Table of Contents

1. [Purpose, scope, and v1 cutoff](#1-purpose-scope-and-v1-cutoff)
2. [Stack and module map](#2-stack-and-module-map)
3. [Process model](#3-process-model)
4. [JSON-RPC server](#4-json-rpc-server)
5. [Python kernel namespace](#5-python-kernel-namespace)
6. [Block equation templates](#6-block-equation-templates)
7. [Simulation pipeline](#7-simulation-pipeline)
8. [Result format and waveform delivery](#8-result-format-and-waveform-delivery)
9. [Solver backend abstraction](#9-solver-backend-abstraction)
10. [Xyce plug-in point (future)](#10-xyce-plug-in-point-future)
11. [External-solver path discovery](#11-external-solver-path-discovery)
12. [Security and process isolation](#12-security-and-process-isolation)
13. [Test strategy](#13-test-strategy)
14. [Out of scope for v1](#14-out-of-scope-for-v1)

---

## 1. Purpose, scope, and v1 cutoff

### 1.1 Purpose

The backend is the Python process that:

- Hosts the user's persistent namespace (numpy / scipy / matplotlib).
- Executes user-written Python code from the workspace REPL.
- Compiles `.gsim` models to a runnable form.
- Runs the simulation.
- Returns waveform results to the frontend.

It is **always a sidecar** — never embedded in the frontend's
process space. On desktop (Tauri) it is spawned at app launch; on
the future paid web tier it runs on a cloud host. The same code
serves both.

### 1.2 v1 cutoff

The backend ships v1 when:

- A Tauri desktop build can launch the sidecar, bind to a random
  `127.0.0.1:<port>`, and serve the IPC envelope without errors.
- `execute(code)` runs arbitrary Python and streams stdout/stderr.
- The workspace snapshot updates after every execution.
- The 10 v1 control blocks (see [`frontend-spec.md`](./frontend-spec.md)
  §9.1) each have an equation template at
  `packages/blocks/src/blocks/<cat>/<name>/equations.py`.
- `simulate(model)` accepts a `.gsim` document, compiles it, runs
  scipy `solve_ivp` with Radau, and returns a result manifest the
  frontend can render in uPlot.
- The waveform LOD endpoint serves a single level (full resolution)
  from the result file; the LOD pyramid is post-v1.
- The smoke test from `progress.frontend.yaml` FE-40 passes against
  this backend (not the stub) on Linux.

### 1.3 What v1 is *not*

- Not Xyce-integrated. Xyce is a documented plug-in point (§10) so
  the architecture can grow into it.
- Not HDF5-backed. v1 uses npy + JSON manifest; HDF5 + LOD pyramid
  is post-v1.
- Not the full DAE pipeline. v1 handles the **control-block subset**
  — every block has explicit causality, no implicit electrical /
  thermal / acausal networks. IR-2 lowering and Pantelides
  index-reduction wait for the semiconductor library.
- Not the cloud kernel. v1 runs as a desktop sidecar only; the
  cloud tier reuses the same code with a different bootstrapping
  layer.

---

## 2. Stack and module map

### 2.1 Stack (locked)

| Layer | Library | Why |
|---|---|---|
| Python | CPython 3.12 | Long-term support; matches uv toolchain |
| Package manager | uv | Already in `pyproject.toml` |
| WebSocket server | `websockets` 12.x | Pure-Python; minimal deps; native async |
| JSON-RPC | hand-rolled (envelope is small and frozen by the IPC spec) | One round-trip to add a wrapper library is more risk than it's worth |
| Numerical | numpy 1.26+, scipy 1.13+ | scipy `solve_ivp` Radau is the solver |
| Symbolic | sympy 1.13+ | IR-2 equation manipulation |
| Plot capture | matplotlib | Renders to base64 PNG on `plot_ready` |
| Test | pytest + pytest-asyncio | Async server tests |
| Static checks | ruff, mypy strict | Already wired |

### 2.2 Folder layout

The scaffold already exists at `apps/kernel-sidecar/src/kernel_sidecar/`
and `packages/simulator/src/simulator/`. The spec locks these
conventions:

```
apps/kernel-sidecar/
└── src/kernel_sidecar/
    ├── __main__.py             entry point — argparse + server bootstrap
    ├── server.py               WebSocket server + handshake + message loop
    ├── ipc/
    │   ├── envelope.py         JSON message types (matches frontend types)
    │   ├── handlers/
    │   │   ├── execute.py      execute / execute_cancel / streaming
    │   │   ├── workspace.py    workspace_get / workspace_update
    │   │   ├── completion.py   completion_request
    │   │   ├── kernel.py       kernel_status / kernel_restart
    │   │   └── simulate.py     simulate / simulate_cancel
    │   └── binary_frame.py     128-byte header + raw array body
    ├── kernel/
    │   ├── namespace.py        persistent global namespace
    │   ├── executor.py         ThreadPoolExecutor wrapper
    │   ├── stdout.py           streaming stdout/stderr interceptor
    │   └── matplotlib_hook.py  figure-capture monkey-patch
    └── waveform/
        ├── manifest.py         result manifest schema
        └── slice_server.py     HTTP slice endpoint (binary payloads)

packages/simulator/
└── src/simulator/
    ├── compiler/
    │   ├── gsim_loader.py      gsim JSON → in-memory ModelDocument
    │   ├── ir1_builder.py      ModelDocument → IR-1 topology graph
    │   ├── ir2_lowering.py     IR-1 → IR-2 flat equation system (control subset)
    │   ├── scipy_compiler.py   IR-2 → f(t, x) → dx/dt callable
    │   └── codegen_state.py    state-vector layout + observation hooks
    ├── ir/
    │   ├── ir1.py              IR-1 dataclasses
    │   └── ir2.py              IR-2 dataclasses (SymPy-backed)
    ├── parsers/                future: SPICE, Modelica adapters
    ├── solvers/
    │   ├── protocol.py         SolverBackend ABC
    │   ├── scipy_solver.py     scipy solve_ivp wrapper
    │   └── xyce_solver.py      stub — see §10
    ├── selection/
    │   └── auto_select.py      backend selection cascade (v1: always scipy)
    ├── postprocess/
    │   └── result_writer.py    npy + JSON manifest
    ├── symbolic/
    │   └── (reserved)          BLT sorting, tearing — post-v1
    └── equation_templates/     thin import-shim into packages/blocks/

packages/blocks/
└── src/blocks/<category>/<name>/
    ├── metadata.yaml           — frontend + simulator shared (existing)
    └── equations.py            — equation template (NEW; this spec)
```

The kernel-sidecar talks to `packages/simulator/` via Python
imports. The simulator never imports the sidecar — the dependency
is one-way.

---

## 3. Process model

### 3.1 Desktop (Tauri sidecar)

```
[Tauri main process]
   │
   ├── spawns
   ▼
[python -m kernel_sidecar --port 0 --token <hex>]
   │
   ├── binds 127.0.0.1:<random>
   ├── prints `KERNEL_READY port=<n> token=<hex>` to stdout
   ▼
[Tauri reads stdout, injects port + token into the WebView]
   ▼
[React frontend connects to ws://127.0.0.1:<port> with token]
```

Tauri kills the sidecar on app exit (SIGTERM, fallback SIGKILL
after 2 s). The sidecar's PID is recorded in
`<app-data>/sidecar.pid` so an orphaned process can be detected on
the next launch.

### 3.2 Web (future)

The cloud kernel is the same Python process behind a TLS-terminated
WebSocket reverse proxy. Authentication uses the platform's user
token, not the local handshake token. Out of scope for v1; see
architecture spec §9 Context C.

### 3.3 Pyodide (future)

The web free tier eventually runs scipy and numpy in WASM via
Pyodide. The kernel-sidecar interface is replaced with an in-browser
adapter that satisfies the same message envelope. The compiler and
equation templates are pure Python — they should run unchanged. The
matplotlib hook and binary frame encoder need WASM-aware
replacements. Out of scope for v1.

---

## 4. JSON-RPC server

### 4.1 Envelope

Matches [`frontend-spec.md`](./frontend-spec.md) §15.2 exactly:

```python
@dataclass(frozen=True)
class Message:
    id: str                  # UUID; correlates request/response/stream
    type: MessageType
    payload: dict[str, Any]  # opaque to the envelope; typed per type
```

### 4.2 Message types (frontend → kernel)

| Type | Handler | Streams replies? |
|---|---|---|
| `execute` | `kernel/executor.py` | yes — `execute_stream`, terminated by `execute_result` |
| `execute_cancel` | `kernel/executor.py` | no |
| `workspace_get` | `ipc/handlers/workspace.py` | no — one binary frame reply |
| `kernel_restart` | `ipc/handlers/kernel.py` | no |
| `completion_request` | `ipc/handlers/completion.py` | no |
| `simulate` | `ipc/handlers/simulate.py` | yes — `simulate_progress`, terminated by `simulate_result` |
| `simulate_cancel` | `ipc/handlers/simulate.py` | no |

### 4.3 Message types (kernel → frontend)

| Type | Payload shape |
|---|---|
| `execute_result` | `{status, plots, workspace_snapshot}` |
| `execute_stream` | `{stream: "stdout"\|"stderr", chunk: str}` |
| `execute_error` | `{exc_type, message, traceback: str}` |
| `workspace_update` | `[{name, type, dtype?, shape?, preview, …}]` |
| `workspace_value` | (binary frame) |
| `plot_ready` | `{format: "png", data: base64}` |
| `completion_reply` | `{matches: [{text, kind, doc?}]}` |
| `kernel_status` | `{state: "idle"\|"busy"\|"restarting"\|"error", reason?}` |
| `simulate_progress` | `{frac: 0..1, message?: str}` |
| `simulate_result` | `{sim_id, t_start, t_end, signals: [{name, dtype, shape, url}], status}` |

### 4.4 Server loop

- One WebSocket connection at a time. A second connect attempt while
  one is open is rejected with code 4000 ("Single-connection
  kernel").
- The server runs `asyncio` on the main thread. Python execution
  runs in a `ThreadPoolExecutor` with a configurable max-workers
  (default 4 for `execute`, 1 for `simulate`).
- Per-request `id` correlates all related outgoing messages
  (streaming chunks share the originating request's id).
- An unhandled exception in a handler emits `execute_error`
  (or `simulate_progress` with `status="error"`) and the loop
  continues. Server crashes only on transport failure.

### 4.5 Handshake

1. Client opens WS to `ws://127.0.0.1:<port>`.
2. Client sends `{id: "handshake", type: "handshake", payload: {token: "<hex>"}}` as the first message.
3. Server compares the token (constant-time) with the value passed
   on the CLI. Mismatch closes with code 4001 ("Bad token").
4. Server replies `{id: "handshake", type: "kernel_status", payload: {state: "idle"}}`.
5. The client may now send any message type.

---

## 5. Python kernel namespace

### 5.1 Pre-imports

The default namespace at sidecar start:

```python
import numpy as np
import scipy
import matplotlib.pyplot as plt
import pandas as pd
import sympy
# convenience aliases
from numpy import pi, e
```

User-set names persist across executions within a session.
`kernel_restart` clears the namespace and re-imports.

### 5.2 Execution

```python
async def execute(code: str, request_id: str) -> ExecuteResult:
    # Send status busy
    await emit("kernel_status", {"state": "busy"})

    # Capture stdout/stderr per-request via context-local writers
    with stdout_router(request_id), stderr_router(request_id):
        try:
            future = executor.submit(_run, code, namespace)
            result = await asyncio.wrap_future(future, cancellable=True)
        except CancelledError:
            await emit("execute_error", {"exc_type": "Cancelled", ...})
            return
        except Exception as exc:
            await emit("execute_error", format_exc(exc))
            return

    snapshot = workspace_snapshot(namespace)
    plots = collect_pending_figures()
    await emit("execute_result", {"status": "ok", "plots": plots,
                                  "workspace_snapshot": snapshot})
    await emit("kernel_status", {"state": "idle"})
```

`_run` evaluates the code via Python's two-step pattern: try
`compile(...code..., mode="eval")` to get a value back; if that
fails (it's a statement), fall back to `mode="exec"`.

### 5.3 stdout / stderr streaming

A subclass of `io.TextIOBase` replaces `sys.stdout` and
`sys.stderr` per-request via a context manager. Every `write(s)`
emits `execute_stream` with the chunk and the originating request's
id. `flush()` is a no-op (already on-write). Buffer size is
unbounded — the frontend handles backpressure.

Streams are **per-request**: a long-running execute does not pollute
a concurrent execute's output. The context-local stream is restored
when the request completes.

### 5.4 Workspace snapshot

After every execute, the snapshot lists every top-level user binding
(filtering out modules, dunder names, and the pre-imports):

```python
def snapshot_entry(name: str, value: Any) -> WorkspaceEntry:
    match value:
        case np.ndarray():
            return {"name": name, "type": "ndarray",
                    "dtype": str(value.dtype), "shape": value.shape,
                    "preview": format_array_preview(value)}
        case int() | float() | complex():
            return {"name": name, "type": type(value).__name__,
                    "value": value}
        case str() if len(value) <= 80:
            return {"name": name, "type": "str", "value": value}
        case str():
            return {"name": name, "type": "str",
                    "preview": value[:77] + "..."}
        case _:
            return {"name": name, "type": type(value).__name__,
                    "preview": repr(value)[:80]}
```

Full array values are **never** in the snapshot. They arrive over
`workspace_get` as binary frames.

### 5.5 Matplotlib figure capture

A monkey-patch on `pyplot.show()` (idempotent) and on figure
creation tracks pending figures per-request. After execute,
each pending figure is rendered to a base64 PNG and emitted as
`plot_ready`, then closed. The user's code never sees a popup.

---

## 6. Block equation templates

### 6.1 File location and shape

One `equations.py` per block, alongside its `metadata.yaml`:

```
packages/blocks/src/blocks/<category>/<name>/
  ├── metadata.yaml
  └── equations.py
```

Every `equations.py` exports two callables:

```python
from typing import Protocol

class BlockEquations(Protocol):
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        """Return the names of internal state variables for this instance.
           For most blocks this is a fixed list (e.g. ['x'] for integrator).
           Dynamic blocks (transfer_function) compute it from params."""

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],     # keyed by port id
        state: dict[str, float],      # keyed by state var name
        params: dict[str, Any],
    ) -> tuple[dict[str, float],      # outputs (keyed by port id)
               dict[str, float]]:     # dstate/dt (keyed by state var name)
        """Compute outputs and state derivatives at one solver step."""
```

Sources are stateless; sinks return `outputs = {}` and
`dstate = {}`. Pure causal blocks return `dstate = {}`. Stateful
blocks return both.

### 6.2 v1 block templates

The 10 v1 blocks have these templates (sketches; full files written
under epic BE-11):

```python
# control/integrator/equations.py
class Equations:
    def state_vars(self, params): return ["x"]
    def derivatives(self, t, inputs, state, params):
        x = max(params["lo"], min(params["hi"], state["x"]))
        return {"out": x}, {"x": inputs["in"]}

# control/gain/equations.py
class Equations:
    def state_vars(self, params): return []
    def derivatives(self, t, inputs, state, params):
        return {"out": params["k"] * inputs["in"]}, {}

# control/pid/equations.py
class Equations:
    def state_vars(self, params): return ["i", "prev_e"]
    def derivatives(self, t, inputs, state, params):
        kp, ki, kd = params["kp"], params["ki"], params["kd"]
        e = inputs["in"]
        u = kp * e + ki * state["i"] + kd * (e - state["prev_e"])
        # anti-windup: only integrate when not saturated
        di = e if (not params["anti_windup"]
                   or abs(u) < SATURATION_GUARD) else 0.0
        return {"out": u}, {"i": di, "prev_e": e}  # prev_e is a sampled state
```

### 6.3 The `prev_e` convention

PID's discrete `e - prev_e` is a hack for v1. The clean answer is a
proper continuous-time PID with a filtered derivative. v1 uses
`d_state = e` for the "previous error" channel and lets the solver's
own step size act as `dt`. **Documented as a known compromise; fixed
in v2 with an explicit filter parameter.**

### 6.4 Cross-validation against metadata

At loader time (BE-10), every `equations.py`'s `state_vars()` is
called with the block's defaults and asserted to match
`metadata.yaml`'s `behavior.state_count`. Mismatches raise at
import — the contract is part of the block, not a coincidence.

---

## 7. Simulation pipeline

### 7.1 Stages (v1)

```
.gsim JSON
   │   gsim_loader.load(path) → ModelDocument
   ▼
ModelDocument
   │   ir1_builder.build(doc) → IR1Graph
   ▼
IR-1 (topology graph)
   │   ir2_lowering.lower(ir1, intent="transient_control") → IR2System
   ▼
IR-2 (flat ODE system — control subset)
   │   scipy_compiler.compile(ir2) → CompiledModel
   ▼
CompiledModel: f(t, x) → dx/dt, plus state-layout map
   │   scipy_solver.solve(model, t_span, options) → ResultBundle
   ▼
ResultBundle: time + per-signal arrays
   │   result_writer.write(bundle, sim_id) → ResultManifest
   ▼
ResultManifest: {sim_id, signals, files, t_start, t_end}
```

### 7.2 IR-1 in v1

The control-block subset only needs:

```python
@dataclass
class IR1Block:
    instance_id: str       # uuid from gsim
    block_type:  str       # catalog key
    params:      dict[str, Any]

@dataclass
class IR1Connection:
    src: tuple[str, str]   # (block instance id, port id)
    dst: tuple[str, str]

@dataclass
class IR1Graph:
    blocks:      list[IR1Block]
    connections: list[IR1Connection]
```

KCL/KVL/bond-graph laws are not needed for causal signal-flow.
Connection compatibility is verified at the IR-1 layer (frontend
already pre-validates, but the simulator never trusts the frontend
for safety).

### 7.3 IR-2 lowering (control subset)

Walk IR-1, instantiate each block's `Equations` class, allocate
state slots in a flat state vector:

```python
@dataclass
class IR2System:
    blocks:       list[InstantiatedBlock]
    state_layout: dict[str, slice]   # (block_id, var_name) -> slice
    output_layout: dict[str, int]    # (block_id, port_id) -> index in output buffer
    sources:      list[str]          # block ids with causality=source
    sinks:        list[str]          # block ids with causality=sink
    eval_order:   list[str]          # block ids in topological order
```

**No tearing / index reduction in v1.** The control subset is
purely causal; topological sort of the connection graph gives a
valid evaluation order. Algebraic loops are rejected with a clear
error at lowering time.

### 7.4 scipy callable compiler

`compile()` returns a closure:

```python
def f(t: float, x: np.ndarray) -> np.ndarray:
    # 1. Read signal sources (constants, steps) into output buffer
    # 2. For each block in eval_order:
    #    - gather inputs from output buffer (via output_layout + connections)
    #    - call block.derivatives(t, inputs, state_slice, params)
    #    - write outputs to output buffer
    #    - write dstate/dt to dx slice
    # 3. Return dx
```

Performance is **not** the v1 priority — clarity is. The closure may
be hot-loopy Python with no numba/cython. A 10 000-step simulation
of a 10-block model runs in under 2 s on a developer laptop. That is
sufficient for the smoke test.

### 7.5 Solver

```python
from scipy.integrate import solve_ivp

result = solve_ivp(
    f, t_span=(t_start, t_end), y0=x0,
    method="Radau",          # stiff-capable; default for our class of problems
    rtol=1e-6, atol=1e-9,
    dense_output=True,       # so we can sample at uniform times for plotting
    t_eval=np.linspace(t_start, t_end, n_samples),
    events=event_callbacks,  # zero-crossings for sinks like 'scope'? — post-v1
)
```

The chosen sample count `n_samples` is min(`max_points`, computed)
where `max_points` comes from the simulate request. v1 default:
3 000 samples — matches the frontend's default LOD slice size.

### 7.6 Cancellation

`simulate_cancel` aborts via a thread-safe flag checked by `f`
itself; on next evaluation `f` raises `CancelledError` and
`solve_ivp` unwinds. The result writer is skipped.

---

## 8. Result format and waveform delivery

### 8.1 v1 result file layout

```
<workdir>/results/<sim_id>/
  ├── manifest.json
  ├── time.npy           float64[N]
  └── signals/
      ├── <block_id>__<port_id>.npy   float32[N]
      └── ...
```

`manifest.json`:

```json
{
  "sim_id": "uuid",
  "schema_version": 1,
  "t_start": 0.0,
  "t_end":   10.0,
  "n_points": 3000,
  "signals": [
    {
      "name":     "scope_1.in",
      "block_id": "uuid-of-scope",
      "port_id":  "in",
      "dtype":    "float32",
      "shape":    [3000],
      "url":      "/results/<sim_id>/signals/uuid-of-scope__in.npy"
    }
  ],
  "status": "ok"
}
```

### 8.2 Slice endpoint

The sidecar serves `/results/<sim_id>/...` over the same HTTP server
that hosts the WebSocket (FastAPI when we promote to it; raw
`websockets` server with an `aiohttp`-ish adapter in v1). Responses
for `.npy` files are sent as `application/octet-stream` with the
file bytes; the frontend's LOD client decodes with
`new Float32Array(buffer.slice(headerLen))`.

The LOD pyramid is post-v1 — v1 serves the full-resolution slice
every time. At 3 000 points × float32 × 20 signals that's ~240 KB,
which is fine over localhost.

### 8.3 Workspace persistence

Result files live under the kernel's `workdir`:

- Desktop: `<tauri-app-data>/sidecar-workdir/`
- Web (future): per-user S3 prefix

A retention policy (post-v1) evicts result dirs older than N days
or beyond M GB. v1 has no eviction — the user deletes manually.

---

## 9. Solver backend abstraction

### 9.1 Why now

Even with v1 shipping scipy only, the boundary between "compiler"
and "solver" matters. Defining the ABC now means swapping in
Xyce / Sundials / Julia DifferentialEquations is a new class, not a
fork.

### 9.2 The protocol

```python
class SolverBackend(Protocol):
    """A backend that runs a CompiledModel and returns a ResultBundle."""

    name: str               # "scipy.radau", "xyce", …
    capabilities: set[str]  # {"transient", "dc_op", "ac"}, …

    def can_handle(self, ir2: IR2System, intent: SimIntent) -> bool: ...

    def solve(
        self,
        compiled: CompiledModel,
        t_span: tuple[float, float],
        options: SolverOptions,
        progress: ProgressCallback | None = None,
        cancel: CancelToken | None = None,
    ) -> ResultBundle: ...
```

v1 ships one implementation — `ScipySolver` — registered in a
module-level registry. The selection cascade (architecture spec
§"Auto-detection engine") collapses to "always pick scipy" in v1.

### 9.3 Backend selection (v1)

`selection/auto_select.py`:

```python
def select_backend(ir2: IR2System, intent: SimIntent) -> SolverBackend:
    if has_circuit_elements(ir2):          # always False in v1
        raise NotImplementedError(
            "Circuit-level simulation requires Xyce, which is post-v1. "
            "Track in adaptive_simulation_backend_idea.md Phase 2.")
    return SCIPY_BACKEND
```

The error path exists so an early adopter who wires up a SPICE-style
component sees a clear "this isn't v1" message, not a stack trace.

---

## 10. Xyce plug-in point (future)

### 10.1 Architecture

When Xyce wiring lands (architecture spec Phase 2), it slots in as
another `SolverBackend` implementation:

```python
class XyceSolver:
    name = "xyce"
    capabilities = {"transient", "dc_op", "ac"}

    def __init__(self, xyce_path: Path, *, mpi_ranks: int = 1):
        self.xyce_path = xyce_path
        self.mpi_ranks = mpi_ranks

    def can_handle(self, ir2, intent):
        return has_circuit_elements(ir2) and intent != "control_only"

    def solve(self, compiled, t_span, options, progress, cancel):
        # 1. IR-2 → SPICE netlist (via packages/simulator/parsers/spice/emit.py)
        # 2. Subprocess: [xyce_path, "-quiet", "-l", log, netlist_path]
        # 3. Stream stdout: parse progress markers, emit progress callbacks
        # 4. On complete: read .csd or .prn result file
        # 5. Adapt to ResultBundle
        ...
```

This file lives at `packages/simulator/src/simulator/solvers/xyce_solver.py`
and is empty in v1 (just the class skeleton, raising
`NotImplementedError("v2")`).

### 10.2 What v1 reserves for it

- `solvers/protocol.py` defines the ABC.
- `solvers/__init__.py` keeps a registry of installed backends.
- `selection/auto_select.py` is the *only* place that picks a
  backend; future additions touch only that file.
- The path discovery story (§11) is implemented at the
  configuration layer in v1 so it's ready when XyceSolver shows up.

---

## 11. External-solver path discovery

The "user provides the path to Xyce" pattern (Qucs) extends to any
external solver we eventually integrate. v1 specifies the discovery
chain once so future solvers reuse it.

### 11.1 Resolution order

1. **Explicit option** to `select_backend()` / passed by the
   frontend in the simulate request (highest priority).
2. **App setting** in `<app-data>/settings.json` under
   `solvers.<name>.path`.
3. **Environment variable** `GENSIM_<NAME>_PATH` (e.g.
   `GENSIM_XYCE_PATH`).
4. **`PATH` lookup** via `shutil.which("<name>")`.
5. **Not found** → raise `SolverNotFoundError`, which the frontend
   surfaces as a translated message with a "Locate <Name>…" action
   that calls back via IPC to update setting #2.

### 11.2 Settings module

`apps/kernel-sidecar/src/kernel_sidecar/config/settings.py`
manages the JSON settings file with atomic writes (write-tmp +
rename). The frontend reads/writes via a `settings_get`/`settings_set`
IPC pair (added when needed; not in v1 message types).

### 11.3 Validation

`SolverBackend.__init__` validates the path: file exists, is
executable, runs `<binary> --version` (or equivalent) and matches
an expected version regex. Bad paths raise immediately with the
discovered path quoted in the message.

---

## 12. Security and process isolation

### 12.1 Binding

The sidecar binds to **`127.0.0.1` only**, never `0.0.0.0`. A port
in the ephemeral range is selected by the OS (CLI flag `--port 0`).
The chosen port is printed once on stdout for Tauri to inject.

### 12.2 Handshake token

A 32-byte hex token is generated by Tauri at sidecar launch and
passed via `--token`. The first WebSocket message must include
this token. Comparisons are constant-time (`hmac.compare_digest`).

### 12.3 Code execution risk

The kernel **executes arbitrary Python code by design** (it is the
REPL). It runs with the user's privileges. The sandboxing
expectations are explicit:

- The kernel is **not** a sandbox.
- The kernel is **only** reachable from `127.0.0.1` + token.
- A malicious model file could embed Python in `metadata.yaml`-like
  fields and have it executed by a buggy loader. The loader **never
  evals** YAML strings; equation templates come from the
  `packages/blocks/` Python files, which are part of our trusted
  code.
- User-supplied custom blocks (post-v1) will run in the same
  namespace and inherit the same risk profile. v2 considers
  sandboxing or capability restrictions for user blocks.

### 12.4 No outbound network

The v1 sidecar does not make outbound network calls under normal
operation. (User code can, of course, do `import requests`; that's
on the user.) The sidecar itself never phones home.

---

## 13. Test strategy

### 13.1 Unit tests (pytest)

Per-module:

- `kernel/` — namespace persistence; snapshot generator; stdout
  routing across concurrent requests.
- `ipc/envelope.py` — round-trip serialize/deserialize of every
  message type.
- `ipc/binary_frame.py` — 128-byte header parse; round-trip dtype
  + shape + bytes for float32/float64/int32 fixtures.
- `simulator/compiler/` — IR-1 round-trip from a fixture .gsim;
  IR-2 layout determinism; scipy callable correctness against
  known closed-form solutions (RC-like first-order, integrator
  with step input).
- `simulator/solvers/scipy_solver.py` — solve_ivp wrapper accepts
  the protocol; honors cancel token.
- `equation_templates/` (one test per block) — `state_vars()`
  matches metadata; `derivatives()` returns correct shapes for
  random inputs.

### 13.2 Integration tests

End-to-end without the frontend:

- Spin up the sidecar in-process (via the server's test harness).
- Open a WS client (from `websockets.client`).
- Send `handshake`, then `simulate` with a fixture model
  (step → PID → integrator → scope).
- Receive `simulate_progress` then `simulate_result`.
- Read the manifest, fetch a signal slice, assert it matches the
  reference waveform within tolerance.

### 13.3 Reference waveforms

Each test model has a precomputed reference waveform under
`tests/backend/fixtures/reference/<model>.npz` (numpy-saved). The
test asserts the live result is within `rtol=1e-4`, `atol=1e-6` of
the reference. Reference files are regenerated by an opt-in script,
not auto-updated on test failure.

### 13.4 Cross-language drift

The block-metadata schema (FE-01) is the contract. CI runs a
two-sided drift test:

- Frontend (TypeScript) loads every `metadata.yaml` and validates.
- Backend (Python) imports every `equations.py` and validates
  `state_vars()` against the metadata.
- Both must agree on the block set or the build fails.

### 13.5 Smoke alignment

`progress.backend.yaml` BE-23 (the end-to-end gate) runs the same
simulate scenario the frontend's `progress.frontend.yaml` FE-40
smoke test runs, asserting the result is byte-equivalent. The two
specs are the contract on each side; the test enforces it.

---

## 14. Out of scope for v1

The following are documented hooks but not implemented in v1.

| Feature | Where the seam is | Spec source |
|---|---|---|
| Xyce wiring (subprocess, .csd parse, MPI) | `simulator/solvers/xyce_solver.py` stub | §10 |
| External-solver path UI (Locate Xyce…) | IPC settings_get/settings_set reserved | §11 |
| HDF5 result store + LOD pyramid | `waveform/manifest.py` `schema_version: 1` reserved for migration | architecture spec §7 |
| FMI 3.0 import/export | `simulator/parsers/` reserved | architecture spec §10 #4 |
| SPICE netlist parser | `simulator/parsers/spice/` reserved | pipeline_IR_design.md §2 |
| Modelica adapter | `simulator/parsers/modelica/` reserved | pipeline_IR_design.md §2 |
| Pyodide bundle target | server.py reuse + WASM-aware binary frames | §3.3 |
| Cloud kernel auth | replace handshake with platform token | §3.2 |
| User-supplied custom blocks (Python) | block loader extension point | §6.4 |
| Block-level C code (QSPICE-style) | future ExternalFunctionBlock per pipeline_IR_design.md §8 | §6 |
| Synthesis (block → C, op-amp circuit, FMU) | `packages/synthesis/` empty stub | simulator_concept.md |
| Index reduction / tearing / BLT sort | `simulator/symbolic/` empty stub | pipeline_IR_design.md §4 |
| Workspace REPL Jedi-backed completion | `ipc/handlers/completion.py` stub returns `[]` | this doc §4.2 |
| GPU acceleration (PyTorch CUDA) | future per-backend capability | architecture spec §8 |
| Job queue (Redis + Celery) | only used in cloud tier | architecture spec §8 |

---

*Living document. Update version + date on every structural change.
Last update: 2026-05-16.*
