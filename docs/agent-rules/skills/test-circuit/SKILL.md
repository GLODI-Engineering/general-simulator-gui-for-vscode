---
name: test-circuit
description: >
  End-to-end workflow for testing a circuit in general-simulator — author a
  .gsim model, compile it through IR1 → SPICE netlist, run it against
  ngspice and Xyce, fetch waveform data, assert correctness, and document
  results. Covers every known parsing caveat for ngspice binary raw files
  and Xyce .prn files.
---

# `/test-circuit` — Test a circuit end-to-end

Use this skill whenever you need to:
- Write an automated test that simulates a circuit with real solvers.
- Parse waveform output from ngspice or Xyce.
- Generate plots from live simulation data.
- Debug unexpected waveforms (flat lines, wrong scale, garbage values).

---

## 0. Prerequisites — solver availability

Solvers are optional at test time. Always guard with `pytest.importorskip`
or `pytest.skip` rather than failing hard.

```python
import shutil, os, pytest

def _require_solver(name: str, env_var: str) -> str:
    """Return path to solver or skip the test."""
    path = os.environ.get(env_var) or shutil.which(name)
    if not path:
        pytest.skip(f"{name} not found — set {env_var} or add to PATH")
    return path

# In test body or fixture:
ngspice = _require_solver("ngspice", "GENSIM_NGSPICE_PATH")
xyce    = _require_solver("Xyce",    "GENSIM_XYCE_PATH")
```

**Resolution order** (`packages/simulator/src/simulator/solvers/path_discovery.py`):
1. `explicit_path` argument to `find_solver()`
2. `~/.local/share/general-simulator/settings.json` key `solvers.<name>.path`
   (respects `XDG_DATA_HOME`)
3. Env var `GENSIM_NGSPICE_PATH` / `GENSIM_XYCE_PATH`
4. `shutil.which(name)`

**Xyce shared library:** Xyce binaries built outside the system package
manager need `LD_LIBRARY_PATH=<xyce_bin>/../lib`. The discovery code injects
this automatically when the directory exists; tests that spawn Xyce directly
must do it manually:

```python
env = {**os.environ,
       "LD_LIBRARY_PATH": str(Path(xyce_path).parent.parent / "lib")}
```

---

## 1. The `.gsim` file format

A `.gsim` file is a JSON document with `schema_version: 1` containing a
single model.

**Schema:** `packages/schemas/definitions/model/gsim.schema.json`  
**Loader:** `packages/simulator/src/simulator/compiler/gsim_loader.py`

```json
{
  "schema_version": 1,
  "model": {
    "id": "rc-test",
    "name": "RC Circuit",
    "grid": 8,
    "blocks": [
      {
        "id": "v1",
        "type": "source.voltage.dc",
        "position": [0, 0],
        "rotation": 0,
        "mirror": "none",
        "params": {"V": 5.0}
      },
      {
        "id": "r1",
        "type": "passive.resistor",
        "position": [1, 0],
        "rotation": 0,
        "mirror": "none",
        "params": {"R": 1000.0}
      },
      {
        "id": "c1",
        "type": "passive.capacitor",
        "position": [2, 0],
        "rotation": 0,
        "mirror": "none",
        "params": {"C": 1e-6, "IC": 0}
      }
    ],
    "wires": [
      {
        "id": "w1",
        "from": {"block": "v1", "port": "p"},
        "to":   {"block": "r1", "port": "p"},
        "waypoints": [],
        "pinned": false
      },
      {
        "id": "w2",
        "from": {"block": "r1", "port": "n"},
        "to":   {"block": "c1", "port": "p"},
        "waypoints": [],
        "pinned": false
      },
      {
        "id": "w3",
        "from": {"block": "c1", "port": "n"},
        "to":   {"block": "v1", "port": "n"},
        "waypoints": [],
        "pinned": false
      }
    ],
    "metadata": {}
  }
}
```

**Gotchas:**
- `position` must be `[int, int]` — floats are rejected by the loader.
- `waypoints` is required by the schema; omitting it fails `jsonschema`
  validation when `jsonschema` is installed. Always include `"waypoints": []`.
- `pinned` is required; always include `"pinned": false`.
- Block `type` must match pattern `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`.
- `rotation` must be one of `[0, 90, 180, 270]`.
- `mirror` must be one of `["none", "x", "y"]`.

**Loading in Python:**

```python
from simulator.compiler.gsim_loader import load_gsim

doc = load_gsim("path/to/circuit.gsim")   # accepts Path, str (path or JSON), or dict
```

---

## 2. Compiling a `.gsim` to a SPICE netlist

```
gsim dict → IR1Graph → write_netlist() → SPICE string
```

### Step 2a — Build IR1

```python
from simulator.compiler.gsim_loader import load_gsim
from simulator.compiler.ir1_builder import build_ir1
from simulator.compiler.spice_netlist_writer import is_circuit_schematic, write_netlist
from simulator.solvers.protocol import SolverOptions

doc  = load_gsim("rc.gsim")
ir1  = build_ir1(doc)

assert is_circuit_schematic(ir1), "Model has no circuit-domain blocks"
```

**`is_circuit_schematic`** returns `True` when any block type starts with
`"passive."`, `"source."`, `"semi."`, or `"tline."`.

**IR1 data structures** (`packages/simulator/src/simulator/ir/ir1.py`):

```python
@dataclass
class IR1Block:
    instance_id: str          # block["id"] from the gsim
    block_type: str           # e.g. "passive.resistor"
    params: dict[str, Any]    # e.g. {"R": 1000.0}

@dataclass
class IR1Connection:
    src: tuple[str, str]      # (block_id, port_id)
    dst: tuple[str, str]

@dataclass
class IR1Graph:
    blocks: list[IR1Block]
    connections: list[IR1Connection]
```

### Step 2b — Write netlist

```python
options = SolverOptions(
    analysis_type = "TRAN",
    t_end         = 5e-3,
    n_samples     = 1000,
    uic           = True,    # skip DC OP; use IC= from element params
)

netlist = write_netlist(ir1, options)
print(netlist)
```

**`write_netlist`** (`packages/simulator/src/simulator/compiler/spice_netlist_writer.py`):

- Returns a complete SPICE string: title comment → elements → analysis line → `.END`.
- Ground net is auto-assigned to `"0"`.
- `IC=<value>` is appended to capacitor/inductor lines when `block.params["IC"]` is set.
- `UIC` is appended to `.TRAN` when `options.uic=True`.

**Analysis line mapping:**

| `analysis_type` | Emitted line | Key options fields |
|---|---|---|
| `"TRAN"` | `.TRAN {t_end/n_samples} {t_end} [UIC]` | `t_end`, `n_samples`, `uic` |
| `"AC"` | `.AC DEC {ac_points} {ac_fstart} {ac_fstop}` | `ac_points`, `ac_fstart`, `ac_fstop` |
| `"DC"` | `.DC {dc_source} {dc_start} {dc_stop} {dc_step}` | `dc_source`, `dc_start`, `dc_stop`, `dc_step` |
| `"OP"` | `.OP` | — |

**Supported block types:**

| Type | SPICE element |
|---|---|
| `passive.resistor` | `R` |
| `passive.capacitor` | `C` (+ `IC=` if set) |
| `passive.inductor` | `L` (+ `IC=` if set) |
| `source.voltage.dc` | `V` |
| `passive.resistor.behavioral` | `R` |
| `passive.capacitor.behavioral` | `C` |
| `passive.capacitor.semiconductor` | `C` |
| `passive.inductor.behavioral` | `L` |

Unknown block types raise `ValueError`.

---

## 3. Running the netlist directly against a solver

Sometimes you need to bypass the kernel IPC and drive a solver directly
from a test — for verifying netlist correctness or generating plots.

### ngspice (binary raw file)

```python
import subprocess, tempfile, os, struct
import numpy as np
from pathlib import Path

def run_ngspice_raw(netlist: str, ngspice_path: str
                   ) -> tuple[list[str], np.ndarray, bool]:
    """Run ngspice and return (var_names, matrix, is_complex).

    Real analysis  → matrix dtype float64,   shape (n_pts, n_vars)
    Complex (AC)   → matrix dtype complex128, shape (n_pts, n_vars)
    """
    with tempfile.NamedTemporaryFile(suffix=".sp", mode="w", delete=False) as f:
        f.write(netlist); sp = f.name
    raw = sp.replace(".sp", ".raw")
    r = subprocess.run([ngspice_path, "-b", "-r", raw, sp],
                       capture_output=True, text=True)
    os.unlink(sp)
    if r.returncode != 0 or not os.path.exists(raw):
        raise RuntimeError(f"ngspice failed:\n{r.stderr[:600]}")
    names, matrix, is_cplx = _parse_ngspice_raw(raw)
    os.unlink(raw)
    return names, matrix, is_cplx


def _parse_ngspice_raw(path: str) -> tuple[list[str], np.ndarray, bool]:
    data = Path(path).read_bytes()
    hdr_end = data.index(b"Binary:\n") + len(b"Binary:\n")
    header  = data[:hdr_end].decode("ascii", errors="replace")

    fields: dict[str, str] = {}
    for line in header.splitlines():
        if ":" in line and not line.startswith("\t"):
            k, _, v = line.partition(":")
            fields[k.strip().lower()] = v.strip()

    n_vars     = int(fields["no. variables"])
    n_pts      = int(fields["no. points"])
    is_complex = "complex" in fields.get("flags", "").lower()

    var_names: list[str] = []
    in_vars = False
    for line in header.splitlines():
        if line.strip().lower().startswith("variables:"):
            in_vars = True; continue
        if in_vars:
            parts = line.split()
            if len(parts) >= 2:
                var_names.append(parts[1])
            if len(var_names) == n_vars:
                break

    raw = data[hdr_end:]
    if is_complex:
        # ⚠️  CRITICAL: ngspice stores EVERY variable (including frequency)
        # as a complex128 pair (re: f64, im: f64) — 16 bytes per variable.
        # Do NOT treat the frequency column as real-only; read all vars
        # uniformly as 2×float64.  Taking real part of frequency is safe.
        vals   = struct.unpack_from(f"<{n_pts * n_vars * 2}d", raw)
        arr    = np.array(vals).reshape(n_pts, n_vars, 2)
        matrix = arr[:, :, 0] + 1j * arr[:, :, 1]
    else:
        vals   = struct.unpack_from(f"<{n_pts * n_vars}d", raw)
        matrix = np.array(vals).reshape(n_pts, n_vars)

    return var_names, matrix, is_complex
```

**Extracting columns:**

```python
# Real analysis
t    = matrix[:, names.index("time")].real
v    = matrix[:, names.index("v(net1)")].real

# AC analysis — use complex value directly
freq = matrix[:, names.index("frequency")].real   # always real
h    = matrix[:, names.index("v(net1)")]           # complex128
mag_db = 20 * np.log10(np.abs(h))
phase  = np.degrees(np.angle(h))
```

**⚠️ AC raw caveat — do not use `float32` or `.PRINT` parsing for AC.**
ngspice `-b` with `-r` suppresses `.PRINT` output (ignored when a raw file
is produced). Always use the raw file for AC.

### Xyce (.prn text file)

```python
def run_xyce_prn(netlist: str, xyce_path: str, xyce_ld: str = ""
                ) -> tuple[list[str], np.ndarray]:
    """Run Xyce and parse the .prn output file.

    Returns (column_headers, data_matrix).
    """
    # ⚠️  Xyce writes <input_file>.prn next to the input file.
    # Run from a controlled directory so you know where to find it.
    with tempfile.NamedTemporaryFile(suffix=".sp", mode="w", delete=False,
                                     dir="/tmp") as f:
        f.write(netlist); sp = f.name
    prn = sp + ".prn"   # Xyce appends .prn to the full filename

    env = {**os.environ}
    if xyce_ld:
        env["LD_LIBRARY_PATH"] = xyce_ld

    r = subprocess.run([xyce_path, sp], capture_output=True,
                       text=True, env=env, cwd="/tmp")
    os.unlink(sp)

    if not os.path.exists(prn):
        raise RuntimeError(f"Xyce PRN not found; stderr:\n{r.stderr[:400]}")

    headers, rows = _parse_xyce_prn(prn)
    os.unlink(prn)
    return headers, np.array(rows, dtype=float)


def _parse_xyce_prn(path: str) -> tuple[list[str], list[list[float]]]:
    lines = Path(path).read_text().splitlines()
    headers: list[str] = []
    rows: list[list[float]] = []
    data_offset = 0

    for line in lines:
        parts = line.split()
        if not parts:
            continue

        if not headers:
            # First non-empty line is the header row
            headers = parts
            # ⚠️  Xyce always includes an INDEX column first.
            # Skip it when reading data values.
            if parts[0].upper() == "INDEX":
                data_offset = 1
            continue

        # "End of Xyce..." trailer terminates data
        if parts[0].lower().startswith("end"):
            break

        try:
            row = [float(p) for p in parts[data_offset:]]
            rows.append(row)
        except ValueError:
            break   # non-numeric line

    # Strip "Index" from headers if present so callers get data columns only
    return headers[data_offset:], rows
```

**Column semantics:**

| Analysis | Column 0 (after Index) | Remaining columns |
|---|---|---|
| TRAN | `TIME` | `{V(NET1)}`, `{V(NET2)}`, … |
| AC | `FREQ` | `{VM(NET1)}`, `{VP(NET1)}`, … |
| DC | *(none — only INDEX + signals)* | `{V(NET1)}`, … |

**⚠️ Xyce column name casing:** Xyce uppercases all net names in output:
`V(net1)` in the netlist → `V(NET1)` (or `{V(NET1)}`) in the .prn header.
Always normalise when searching: `h.upper()` or `.lower()`.

**⚠️ Xyce `.PRINT` requirement:** Xyce will not produce any `.prn` without
a `.PRINT` statement. The `xyce_solver.py` auto-inserts
`.PRINT TRAN V(net1) V(net2)` if none is present, but only captures the
first two nets. For circuits with more nets, or for AC/DC, always include
an explicit `.PRINT` in the netlist:

```spice
.PRINT TRAN {V(net1)} {I(Rr1)}
.PRINT AC   {VM(net1)} {VP(net1)}
.PRINT DC   {V(net1)}
```

---

## 4. Xyce DCOP floating-node requirement

Xyce cannot start a simulation when any node has no DC path to ground.
A node connected only through capacitors (or AC-coupled nodes) has no DC
path, causing:

```
Netlist warning: Numerically singular matrix found by Amesos
DC Operating Point Failed.
```

**Fix:** Add a high-value bleed resistor from the floating node to ground.
`1 TΩ` (1e12 Ω) is large enough to be invisible to the circuit response.

```spice
* Add this line for any AC-coupled or capacitor-only node:
Rbleed net1 0 1e12
```

**When you need it:**
- Any node connected only through capacitors (RC charging circuit with cap to ground)
- AC-coupled amplifier stages
- Any node with no resistive path to ground at DC

**When you do NOT need it:**
- Purely resistive networks (dividers, bridges)
- Nodes with at least one resistor to a grounded node

**Interaction with initial conditions:**
The bleed resistor causes DCOP to compute V(net1) ≈ Vsource (cap fully
charged). To start the transient from zero volts, override with `.IC`:

```spice
.IC V(net1)=0
```

ngspice alternative — use `IC=0 UIC` on the element and `.TRAN ... UIC`:

```spice
Cc1 net1 0 1e-6 IC=0
.TRAN 5e-6 5e-3 UIC
```

`UIC` skips DCOP entirely in ngspice; it does **not** work in Xyce (Xyce
ignores the `UIC` keyword). Use `.IC` for Xyce.

---

## 5. Sending a simulation over the kernel IPC (WebSocket)

Use this path when testing the full stack (gsim → kernel → solver → result).

### 5a — Start the kernel-sidecar (in tests)

The `e2e_server` fixture from `tests/backend/conftest.py` starts an
in-process server on a random port. Use it in `pytest-asyncio` tests:

```python
import pytest, pytest_asyncio

@pytest.mark.asyncio
async def test_my_circuit(e2e_server: dict) -> None:
    ws_uri   = e2e_server["ws_uri"]    # "ws://127.0.0.1:<port>"
    http_base = e2e_server["http_base"] # "http://127.0.0.1:<port>/"
    token    = e2e_server["token"]
    ...
```

### 5b — Handshake

```python
import json
import websockets

async with websockets.connect(ws_uri) as ws:
    # Mandatory first message
    await ws.send(json.dumps({
        "id": "hs",
        "type": "handshake",
        "payload": {"token": token}
    }))
    reply = json.loads(await ws.recv())
    assert reply["payload"]["state"] == "idle"
```

### 5c — Send a simulate request

```python
    model_doc = {          # full ModelDocument (load_gsim() output)
        "schema_version": 1,
        "model": { ... }
    }

    await ws.send(json.dumps({
        "id": "sim-1",
        "type": "simulate",
        "payload": {
            "model": model_doc,
            "options": {
                "analysis_type": "TRAN",
                "t_start": 0.0,
                "t_end": 5e-3,
                "n_samples": 1000,
                "uic": True,         # optional
            },
            "solver": "ngspice"      # optional; omit for auto-select
        }
    }))
```

### 5d — Collect the result

The kernel sends `kernel_status` → (zero or more `simulate_progress`) →
`simulate_result`. Filter by `type`:

```python
import asyncio

    result = None
    deadline = asyncio.get_event_loop().time() + 30.0
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise TimeoutError("simulation timed out")
        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        msg = json.loads(raw)
        if msg["type"] == "simulate_result":
            result = msg["payload"]
            break

    assert result["status"] == "ok", result.get("message")
    sim_id = result["sim_id"]
```

**simulate_result success payload:**
```json
{
  "sim_id": "<uuid>",
  "status": "ok",
  "t_start": 0.0,
  "t_end": 5e-3,
  "n_points": 1000,
  "manifest_url": "/results/<sim_id>/manifest.json",
  "signals": [
    {
      "name": "v(net1)",
      "block_id": "spice",
      "port_id": "signal_0",
      "dtype": "float32",
      "shape": [1000],
      "url": "/results/<sim_id>/signals/spice__signal_0.npy"
    }
  ]
}
```

**simulate_result error payload:**
```json
{
  "status": "error",
  "exc_type": "ValidationError",
  "message": "human-readable reason",
  "signals": []
}
```

### 5e — Fetch waveform data via HTTP

```python
import io, urllib.request
import numpy as np

def fetch_npy(http_base: str, url_path: str, token: str) -> np.ndarray:
    """Fetch a .npy signal file and return the numpy array."""
    # ⚠️  manifest signal URLs are RELATIVE ("results/...").
    # WS simulate_result URLs are ABSOLUTE ("/results/...").
    # Normalise to absolute before appending to http_base.
    path = url_path if url_path.startswith("/") else f"/{url_path}"
    url  = f"{http_base.rstrip('/')}{path}?token={token}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return np.load(io.BytesIO(resp.read()))

# Example:
signal = result["signals"][0]
data = fetch_npy(http_base, signal["url"], token)
```

**Fetch the manifest:**
```python
def fetch_manifest(http_base: str, sim_id: str, token: str) -> dict:
    url = f"{http_base.rstrip('/')}/results/{sim_id}/manifest.json?token={token}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode())
```

**Waveform data types:**
- Time vector: `float64[N]` — served as `time.npy` but not exposed via the
  signal API; time axis must be reconstructed from `t_start`, `t_end`, `n_points`.
- Signal data: `float32[N]` — every signal file.

---

## 6. Asserting waveform correctness

### Against analytic reference

```python
import numpy as np

R, C, V0 = 1000.0, 1e-6, 5.0
tau = R * C

t = np.linspace(0, 5 * tau, len(data))
expected = V0 * (1 - np.exp(-t / tau))

np.testing.assert_allclose(data, expected, rtol=1e-2, atol=0.05)
```

Use generous tolerances for solver-vs-analytic comparisons:
- `rtol=1e-2` (1 %) is reasonable for adaptive-step solvers.
- `atol=0.05` absorbs early-transient grid alignment differences.

### Checking steady-state values

```python
# Last 10 % of points should be at steady state
ss = data[int(0.9 * len(data)):]
assert np.allclose(ss, V0, atol=0.05), f"Steady state {ss.mean():.3f} ≠ {V0}"
```

### Checking AC corner frequency

```python
# |H(fc)| should be 1/√2 ≈ 0.7071
fc_idx = np.argmin(np.abs(freq - fc))
assert abs(np.abs(h[fc_idx]) - 1/np.sqrt(2)) < 0.01
```

### Cross-solver agreement

```python
# Interpolate to common time base before comparing
from scipy.interpolate import interp1d
t_common = np.linspace(0, t_end, 500)
v_ng_i   = interp1d(t_ng, v_ng)(t_common)
v_xy_i   = interp1d(t_xy, v_xy)(t_common)
np.testing.assert_allclose(v_ng_i, v_xy_i, rtol=1e-2, atol=0.05)
```

---

## 7. Generating plots

```python
import matplotlib
matplotlib.use("Agg")   # non-interactive backend; required in CI / headless
import matplotlib.pyplot as plt
from pathlib import Path

OUT = Path("docs/circuit_test/<circuit_name>")
OUT.mkdir(parents=True, exist_ok=True)

# TRAN plot
fig, ax = plt.subplots(figsize=(8, 4))
ax.plot(t_ng * 1e3, v_ng, label="ngspice")
ax.plot(t_xy * 1e3, v_xy, "--", label="Xyce")
ax.plot(t_ref * 1e3, v_ref, ":", color="gray", label="analytic")
ax.set_xlabel("Time (ms)"); ax.set_ylabel("Voltage (V)")
ax.set_title("RC Charging"); ax.legend(); ax.grid(True, alpha=0.3)
fig.tight_layout()
fig.savefig(OUT / "tran.png", dpi=150)
plt.close(fig)

# AC Bode (two-panel)
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 6), sharex=True)
ax1.semilogx(freq, 20 * np.log10(np.abs(h)))
ax2.semilogx(freq, np.degrees(np.angle(h)))
ax1.set_ylabel("Magnitude (dB)"); ax2.set_ylabel("Phase (°)")
ax2.set_xlabel("Frequency (Hz)")
fig.tight_layout()
fig.savefig(OUT / "ac_bode.png", dpi=150)
plt.close(fig)
```

Run plot-generation scripts with `uv run python <script>` from the repo root.
Do not import matplotlib in test files — plots are for documentation only.

---

## 8. Checklist — writing a new circuit test

```
[ ] Circuit defined as a .gsim dict or file in tests/backend/fixtures/
[ ] load_gsim() + build_ir1() + is_circuit_schematic() asserted True
[ ] write_netlist() called; netlist content spot-checked with assert/contains
[ ] Solver guarded with pytest.skip (not pytest.fail) when absent
[ ] For Xyce: bleed resistor added if any node is capacitor-only
[ ] For Xyce: .IC used instead of UIC for initial conditions
[ ] For ngspice AC: result parsed as complex128 (not real float)
[ ] For Xyce AC: column headers normalised to lower-case before lookup
[ ] Assertions use rtol/atol tolerances, not exact equality
[ ] Test marked @pytest.mark.asyncio if using e2e_server fixture
[ ] All gates pass: ruff, mypy, pytest before committing (use /commit skill)
```

---

## 9. Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Flat waveform at steady state | ngspice DCOP pre-charges cap before transient | Add `IC=0` param + `uic=True` on `SolverOptions` |
| Xyce: "Singular matrix / DC Operating Point Failed" | Floating node (no DC path to ground) | Add `Rbleed node 0 1e12` |
| Xyce: `.prn` file not created | Missing `.PRINT` statement | Add `.PRINT TRAN {V(net1)}` to netlist |
| AC Bode magnitude always ~0 dB / phase always 0° | AC raw parsed as real; got wrong bytes | Use complex128 parser (`is_complex=True` branch) |
| AC Bode random garbage values | Wrong byte offset — treating freq as real-only shifts all subsequent reads | All AC variables are 16 bytes; never skip to byte 8 for var[1] |
| Xyce column not found | Column name is uppercase `V(NET1)`, not `v(net1)` | Normalise: `col.upper()` or `.lower()` |
| `waypoints` schema error | Wire dict missing required field | Add `"waypoints": []` |
| Xyce `TRAN` result has only 2 signals | Auto-inserted `.PRINT` only covers `net1`/`net2` | Add explicit `.PRINT` in netlist |
| `http_base` double-slash in URL | `http_base` has trailing `/` | Use `f"{http_base.rstrip('/')}{path}"` |
| Manifest `url` gives 404 | Manifest URL is relative; missing leading `/` | Normalise: `url if url.startswith("/") else f"/{url}"` |
| ngspice timeout formula odd | `timeout = max(t_end * 1000, 60)` s — short sims get 60 s | This is intentional; do not change without updating `ngspice_solver.py` |

---

## 10. Reference files

| Path | Purpose |
|---|---|
| `packages/simulator/src/simulator/compiler/gsim_loader.py` | `.gsim` loader |
| `packages/simulator/src/simulator/compiler/ir1_builder.py` | gsim → IR1 |
| `packages/simulator/src/simulator/compiler/spice_netlist_writer.py` | IR1 → SPICE string |
| `packages/simulator/src/simulator/compiler/ir2_lowering.py` | IR1 → IR2 (control path) |
| `packages/simulator/src/simulator/solvers/protocol.py` | `SolverOptions`, `ResultBundle`, `Signal` |
| `packages/simulator/src/simulator/solvers/path_discovery.py` | Solver binary discovery |
| `packages/simulator/src/simulator/solvers/ngspice_solver.py` | ngspice wrapper |
| `packages/simulator/src/simulator/solvers/xyce_solver.py` | Xyce wrapper |
| `packages/simulator/src/simulator/parsers/spice/ngspice_raw.py` | ngspice binary raw parser |
| `packages/simulator/src/simulator/parsers/spice/xyce_prn.py` | Xyce .prn parser |
| `apps/kernel-sidecar/src/kernel_sidecar/ipc/handlers/simulate.py` | IPC simulate handler |
| `apps/kernel-sidecar/src/kernel_sidecar/waveform/slice_server.py` | HTTP waveform server |
| `apps/kernel-sidecar/src/kernel_sidecar/ipc/envelope.py` | WS message envelope |
| `tests/backend/conftest.py` | `e2e_server` fixture |
| `tests/backend/e2e/test_rc_circuit_per_solver.py` | Reference e2e test |
| `packages/schemas/definitions/model/gsim.schema.json` | .gsim JSON schema |
| `docs/circuit_test/rc_circuit/` | RC circuit test report + plots |
