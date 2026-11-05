# Adaptive Simulation Backend: Architecture & Programming Roadmap

## Core Concept

The simulator exposes a **dual-mode philosophy**: the user can explicitly choose their fidelity level, or let the system **auto-detect** the appropriate backend based on circuit composition and analysis intent. This mirrors how real engineers think — not in terms of solvers, but in terms of *questions they are asking about their circuit*.

---

## User-Facing Control Layer

### 1. Component-Level Choice: Ideal vs. Real Devices

The user selects per-component (or globally) whether switching devices are:

| Mode | Device Representation | Example |
|---|---|---|
| **Ideal Switch** | Instantaneous open/close, zero on-resistance, infinite off-resistance | PWL-engine IGBT, diode |
| **Behavioral** | Vendor datasheet curve-fitted model (Vth, Rds_on, Coss, etc.) | Averaged or lookup-table MOSFET |
| **Physical (SPICE)** | Standard SPICE level model (BSIM4, BSIM-CMG, Level 3) | Foundry PDK MOSFET |
| **Physical (Xyce)** | Full DAE with radiation-aware or extended device physics | Sandia/advanced process MOSFET |

This choice is the **primary signal** for backend selection.

---

### 2. Analysis-Intent Declaration

The user states what they want to know:

| Intent | Typical Question | Implied Backend |
|---|---|---|
| **System-level power flow** | "What is the efficiency of my converter at 100 kHz?" | Custom PWL / State-Space engine |
| **Waveform shape & switching loss** | "What does the drain voltage look like during turn-off?" | Behavioral / SPICE-class (EEspice tier) |
| **Device stress & parasitics** | "Is my MOSFET exceeding Vds_max during ringing?" | ngspice / SPICE3-compatible |
| **Transistor-level accuracy** | "What is the exact Id-Vgs curve under process variation?" | Xyce (full DAE, PDK models) |
| **Large-scale parallel** | "Simulate a 10,000-device power grid transient" | Xyce + MPI |

Both axes (component mode + analysis intent) feed the auto-selection engine.

---

## Auto-Detection Engine

When the user does not explicitly choose, the engine inspects the netlist and infers the appropriate backend. Detection proceeds as a **decision cascade**:

```
1. Are ALL switching devices ideal (on/off only, no nonlinear I-V)?
   AND is the circuit purely RLC + sources + ideal switches?
   → Backend: Custom PWL / State-Space Engine (Tpetra + Kokkos)
      · Zero Newton-Raphson iterations
      · Topology-switch at switching events via matrix reconstruction
      · Fixed system matrix per topological state
      · MPI + GPU acceleration via Trilinos modern stack

2. Are some devices behavioral (curve-fitted, lookup table)?
   OR does the user request switching loss / waveform detail?
   → Backend: SPICE-class (ngspice / EEspice parallel stamping)
      · Full Newton-Raphson per timestep
      · Standard MNA + sparse direct solver (KLU)
      · Parallel device evaluation via graph coloring (EEspice approach)
      · Moderate model fidelity, fast enough for board-level

3. Are devices specified with full PDK SPICE models (BSIM4, BSIM-CMG)?
   OR does the user request process variation / mismatch / radiation effects?
   OR does the circuit exceed ~10,000 devices?
   → Backend: Xyce (Trilinos / MPI parallel)
      · Full DAE formulation
      · NOX nonlinear solver + Belos iterative linear solver
      · Tpetra distributed linear algebra (Epetra stack retired end of 2025)
      · Parallel across N CPUs via MPI; GPU path via Tpetra + Kokkos
      · Homotopy/continuation for difficult convergence
```

The engine emits a **backend selection report** before simulation begins, explaining its reasoning and offering the user an override.

**Escalation rule**: the engine never silently downgrades. If auto-detection picks the PWL backend but a physical effect is detected in the netlist that cannot be represented as piecewise-linear (e.g., reverse recovery, body diode conduction, saturable inductor), the engine escalates to SPICE-class and warns the user with a specific reason.

---

## Hybrid Simulation: Mixed Fidelity in One Netlist

For large mixed circuits (e.g., a power stage + gate driver + control IC), different subcircuits can use different backends simultaneously:

- **Power stage** (ideal switches, bulk RLC) → Custom PWL engine
- **Gate driver IC** (discrete MOSFETs with behavioral models) → EEspice/SPICE engine
- **Control IC or analog block** (full PDK transistors) → Xyce engine

Subcircuit interfaces exchange **port variables** (voltage/current at boundaries) at each co-simulation timestep. This is analogous to what SystemC-AMS or Modelica do for multi-domain co-simulation.

---

## Open Source Landscape: What Exists and What Doesn't

This section documents the research done before choosing a build-vs-integrate strategy for each tier.

### PWL / Power Electronics Tier

**GeckoCIRCUITS** (ETH Zurich, GPL v3, `github.com/geckocircuits/GeckoCIRCUITS`)
- Open source power electronics circuit simulator with multi-domain support (electrical, thermal, magnetic, mechanical).
- Speed comes from a state-space PWL engine — the right algorithmic approach.
- **Fatal limitation**: written entirely in Java. No MPI, no GPU, no Trilinos integration. Architecturally incompatible with HPC deployment.
- **Use as**: algorithm reference and validation benchmark only. Study its topology switching and state-space reconstruction logic.

**GSEIM** (IIT Bombay, open source, `github.com/gseim/gseim`)
- General-purpose simulator with explicit and implicit ODE methods, extended for power electronics.
- Has explored parallel simulation via TLM (Transmission Line Modelling) decoupling: large stiff circuits split into smaller subcircuits via TLM links, each run in a separate module in parallel.
- **Limitation**: TLM-based parallelism, not MPI-based distributed linear algebra. C++ numerical engine but no Trilinos/Kokkos integration.
- **Use as**: TLM decoupling is a valid co-simulation interface idea for the hybrid mixed-fidelity case.

**Verdict**: No open source PWL simulator exists built on Trilinos, Kokkos, or with MPI/GPU acceleration. **The custom PWL engine built on Tpetra + Kokkos is a genuinely novel contribution.** This is the greenfield build.

---

### SPICE-Class / Intermediate Tier

**EEspice** (open source, `github.com/eelab-dev/eespice`, published April 2025)
- Modular SPICE framework that decouples device model evaluation into replaceable parallel kernels.
- Uses **graph coloring** to partition MOSFET instances into conflict-free color groups, enabling parallel stamping of the MNA matrix without race conditions.
- Achieves up to **45x speedup on 64 cores** over single-thread ngspice while matching ngspice accuracy.
- Known gap: sparse solver is still sequential; the authors flag this as future work.
- **Use as**: direct candidate for the SPICE-class tier, or at minimum harvest its graph-coloring parallel stamping approach and integrate into a custom SPICE-class backend.

**ngspice** (open source, BSD, `ngspice.sourceforge.io`)
- Mature, actively maintained (release 44.2, January 2025). Full BSIM4, VBIC, EKV3 model support.
- Single-threaded by design; no MPI, no GPU.
- **Use as**: fallback SPICE-class backend for v1 (well-tested, broad model library). Replace or supplement with EEspice for parallelism over time.

**TinySPICE** (academic, GPU, not open source — IEEE DAC 2013)
- GPU-based parallel SPICE for massively repeated *small* circuit simulations (SRAM, cell characterization). Uses 3D LUTs for GPU-accelerated device evaluation.
- **Use as**: conceptual reference for GPU LUT-based behavioral device evaluation in the intermediate tier. Not directly reusable (not open source, wrong use case for large single circuits).

---

### Full DAE / HPC Tier

**Xyce** (Sandia National Laboratories, GPL v3, `github.com/Xyce/Xyce`)
- Production-ready. Ships as the v1 backend for this tier immediately.
- **Critical 2025 update**: The old Epetra linear algebra stack has been archived and removed from Trilinos by end of 2025. The forward path is Tpetra + Kokkos for GPU/MPI hybrid parallelism. Do not write new code against Epetra.
- Current Trilinos solver stack for Xyce: NOX (nonlinear) → Belos (iterative linear, replaces retired AztecOO) → Tpetra (distributed LA, replaces retired Epetra) → Kokkos (GPU kernels) → MueLu / FROSch (preconditioners, GPU-ported via Kokkos Kernels, Yamazaki et al. 2023).
- **Use as**: ship immediately. Track Xyce's own Tpetra migration and align with it.

---

## Technology Stack Per Backend

### Custom PWL Engine (build — greenfield)

```
Circuit topology manager          [custom C++]
  ↓ switching event detected
State-space reconstructor         [custom C++]
  ↓ new system matrix A, b
Distributed sparse linear algebra [Tpetra — NOT Epetra, retired 2025]
  ↓
GPU / CPU kernels                 [Kokkos + KokkosKernels]
  ↓                                 backends: CUDA, HIP, SYCL, OpenMP
Iterative solver                  [Belos: GMRES or CG]
  ↓
Preconditioner                    [MueLu or FROSch — both GPU-capable]
  ↓
MPI communication                 [MPI via Tpetra comm layer]
```

Key algorithmic primitives to implement:

- **Topology state machine**: tracks which switches are open/closed. Each state maps to a precomputed or incrementally reconstructed system matrix.
- **Matrix caching**: for circuits with N switches there are at most 2^N topological states. Cache assembled matrices for states that recur (common in periodic converters: buck, boost, H-bridge). For large N (MMC, 3-level NPC), use incremental update instead of full recomputation.
- **Event-driven timestepping**: advance with fixed or adaptive ODE step (TR-BDF2 recommended for stiffness) between switching events. At a switching instant: reconstruct matrix, reset integrator initial conditions — no NR loop ever.
- **Saturable / partially nonlinear elements**: detect at netlist parse time and flag for escalation to SPICE tier. Do not attempt to linearize inside the PWL engine.

### SPICE-Class Engine (integrate EEspice + ngspice)

```
Device model evaluation     [EEspice parallel graph-coloring stamping]
  ↓ parallel MNA stamp       up to 45x speedup vs single-thread on 64 cores
Sparse direct solver        [KLU via SuiteSparse — replace with SuperLU_DIST
  ↓                          or NVIDIA cuSolver for parallel linear solve]
Newton-Raphson loop         [standard NR with adaptive timestep control]
  ↓
Model library fallback      [ngspice: BSIM4, VBIC, EKV3, full PDK zoo]
```

Near-term improvement: replacing KLU with a parallel sparse solver (SuperLU_DIST via MPI, or cuSolver on GPU) eliminates EEspice's known bottleneck in the linear solve step and extends speedup to the full NR pipeline.

### Xyce Tier (ship now, evolve with upstream)

```
Full DAE formulation        [Xyce native MNA]
  ↓
NOX nonlinear solver        [Trilinos/NOX — Newton + homotopy/continuation]
  ↓
Belos iterative solver      [Trilinos/Belos — GMRES; AztecOO retired]
  ↓
Tpetra distributed LA       [Trilinos/Tpetra — Epetra retired end 2025]
  ↓
Kokkos GPU kernels          [CUDA / HIP / SYCL via Kokkos backends]
  ↓
MueLu / FROSch              [GPU-ported preconditioners]
  ↓
MPI across N nodes
```

---

## Capability Matrix

| Capability | GeckoCIRCUITS | ngspice | EEspice | Xyce | **This Project** |
|---|---|---|---|---|---|
| Ideal switch / PWL speed | ✅ Best | ❌ | ❌ | ❌ | ✅ Custom Tpetra engine |
| Real MOSFET physics (BSIM4) | ❌ | ✅ | ✅ | ✅ | ✅ Routes to Xyce |
| Auto backend selection | ❌ | ❌ | ❌ | ❌ | ✅ Core feature |
| Mixed fidelity in one netlist | ❌ | ❌ | ❌ | ❌ | ✅ Co-sim boundary |
| MPI parallelism | ❌ | ❌ | ❌ | ✅ | ✅ All tiers (roadmap) |
| GPU acceleration | ❌ | ❌ | ❌ | Partial (Tpetra path) | ✅ Kokkos all tiers |
| Parallel device stamping | ❌ | ❌ | ✅ 45x/64 cores | ✅ | ✅ Harvested from EEspice |
| User backend explanation | ❌ | ❌ | ❌ | ❌ | ✅ Selection report |
| Open source | ✅ GPL3 | ✅ BSD | ✅ | ✅ GPL3 | ✅ (plan license early) |

---

## Key Design Principles

1. **Fidelity follows the question, not the component library.** The same MOSFET symbol resolves to an ideal switch, a behavioral model, or a full PDK model depending on what the user is asking.

2. **The engine never silently downgrades.** If auto-detection picks PWL but a physical effect that cannot be represented in PWL is detected (reverse recovery, body diode, saturable inductor), the engine escalates and tells the user exactly why.

3. **Speed is the default, accuracy on demand.** Default to the fastest solver that can correctly answer the stated question. The user should not need to understand Trilinos to get a fast simulation.

4. **The NR iteration count is a visible metric.** The UI surfaces average NR iterations per timestep as a health indicator — high counts signal model mismatch or a topology choice that is costing unnecessary simulation time.

5. **Switching event detection is structural, not numerical.** For the PWL backend, switch state changes are topology events handled by matrix reconstruction — not by timestep cutting through a discontinuity. This is the exact mechanism that makes PWL simulators orders of magnitude faster than SPICE at the power electronics level.

6. **The Trilinos Epetra stack is dead.** As of end 2025, Epetra has been removed from Trilinos. All new code targets Tpetra + Kokkos. Do not start any new development against Epetra.

---

## Phased Delivery Roadmap

### Phase 1 — Ship with Xyce Backend Only
- Wire up Xyce as the sole active solver.
- Build the user-facing intent declaration UI and component fidelity selector (the four-mode device table).
- Implement the backend selection report (even if it always picks Xyce for now).
- Validate against known SPICE reference circuits (voltage divider, RC, RLC, diode rectifier, simple buck).

### Phase 2 — Integrate SPICE-Class Tier
- Embed ngspice as a library for the SPICE-class tier.
- Port or directly integrate EEspice's graph-coloring parallel stamping approach.
- Route behavioral and intermediate-fidelity circuits to this tier via the auto-detection cascade.
- Replace KLU with SuperLU_DIST or cuSolver to close EEspice's linear solve bottleneck.

### Phase 3 — Build Custom PWL Engine (greenfield, Tpetra + Kokkos)
- Implement topology state machine and switching event detector in C++.
- Implement state-space matrix assembler with matrix caching.
- Wire distributed linear algebra to Tpetra (not Epetra).
- Add Kokkos GPU backend (CUDA first, then HIP for AMD portability).
- Add MPI domain decomposition for large PWL circuits.
- Validate against GeckoCIRCUITS on canonical power electronics benchmarks: buck, boost, LLC resonant converter, H-bridge, Modular Multilevel Converter (MMC).

### Phase 4 — Hybrid Co-Simulation
- Implement co-simulation boundary: port variable exchange (V/I) between PWL, SPICE-class, and Xyce subcircuits at each timestep boundary.
- Timestep synchronization: event-driven handshake at switching instants; interpolation at interior steps between events.
- Expose mixed-fidelity netlist annotation syntax so users can tag subcircuits with their intended backend.

---

## Open Questions for Design Decisions

- **Co-simulation synchronization**: at the PWL ↔ Xyce subcircuit boundary, use interpolation (simpler, may introduce lag) or event-driven handshake (accurate but requires both engines to agree on event times)?
- **Partially nonlinear elements**: for a saturable inductor in an otherwise PWL circuit, escalate the entire subcircuit to SPICE, or isolate the single nonlinear element into a separate mini-solver and couple it to the PWL engine at each step?
- **Intermediate solver tier**: does the behavioral tier warrant an **exponential integrator** (active research area for power electronics) rather than full SPICE NR? Could give SPICE-class accuracy at near-PWL speed for certain topologies. Worth a prototype.
- **Matrix caching strategy for large switch counts**: for converters with many switch states (3-level NPC, MMC with many submodules), 2^N cached matrices becomes impractical. Need an incremental assembly strategy that recomputes only the rows/columns affected by a topology change.
- **Licensing**: Xyce is GPL v3, EEspice is open source, GeckoCIRCUITS is GPL v3. The custom PWL engine built clean-room (no PLECS code) is unencumbered. Decide on the project's own license before Phase 3 begins to avoid GPL propagation surprises if the project is ever commercialized.
