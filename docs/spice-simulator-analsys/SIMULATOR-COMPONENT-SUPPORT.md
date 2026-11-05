# SPICE Simulator Component & Analysis Support

**Sources:** ngspice 46 User Manual · Xyce 7.10 Reference Guide  
**Purpose:** Reference for general-simulator engine integration — what each simulator can model, where they differ, and what is exclusive to one.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully supported |
| ⚠️ | Partial / limited support (see notes) |
| ❌ | Not supported |
| 🔵 | ngspice only |
| 🟠 | Xyce only |

---

## 1. Passive Devices

| Device | ngspice 46 | Xyce 7.10 | Notes |
|--------|-----------|-----------|-------|
| Resistor (linear) | ✅ | ✅ | Both support temperature coefficients TC1/TC2 |
| Semiconductor resistor | ✅ | ✅ | Sheet-resistance model (W/L scaling) |
| Behavioral resistor (expr) | ✅ | ✅ | ngspice: `R=expr`; Xyce: expression support in model |
| Resistor r2_cmc / r3_cmc | 🔵 ✅ | ❌ | CMC compact models via OpenVAF in ngspice only |
| Capacitor (linear) | ✅ | ✅ | Both support initial conditions |
| Semiconductor capacitor | ✅ | ✅ | Voltage-dependent, W/L scaling |
| Behavioral capacitor (expr) | ✅ | ✅ | ngspice: `C=expr`; Xyce: expression-based |
| Inductor (linear) | ✅ | ✅ | Both support initial conditions |
| Inductor model (with parasitics) | ✅ | ✅ | R, C parasitics on model card |
| Behavioral inductor (expr) | ✅ | ⚠️ | ngspice has explicit `L=expr`; Xyce via B-source workaround |
| Coupled (mutual) inductors | ✅ | ✅ | `K` element; Xyce uses its own Sandia model (not PSpice-compatible) |
| Voltage-controlled switch | ✅ | ✅ | SW model |
| Current-controlled switch | ✅ | ✅ | CSW model |
| Generic switch (expr-controlled) | ❌ | ✅ | Xyce-specific "Generic Switch" device (2.3.23) |
| Memristor | ❌ | ✅ 🟠 | Xyce: TEAM, Yakopcic, PEM formulations (device 2.3.32) |
| Accelerated mass (mechanical) | ❌ | ✅ 🟠 | Xyce electromechanical device (2.3.30) |
| Power grid element | ❌ | ✅ 🟠 | Xyce dedicated power-grid device (2.3.31) |

---

## 2. Voltage & Current Sources

| Source | ngspice 46 | Xyce 7.10 | Notes |
|--------|-----------|-----------|-------|
| Independent V source | ✅ | ✅ | |
| Independent I source | ✅ | ✅ | |
| Pulse (PULSE) | ✅ | ✅ | |
| Sinusoidal (SIN) | ✅ | ✅ | |
| Exponential (EXP) | ✅ | ✅ | |
| Piece-wise linear (PWL) | ✅ | ⚠️ | Not fully compatible with HSPICE/PSpice syntax in Xyce |
| Single-frequency FM (SFFM) | ✅ | ✅ | |
| Amplitude modulated (AM) | ✅ | ✅ | |
| Transient noise source | 🔵 ✅ | ❌ | ngspice TRNOISE waveform; not in Xyce |
| Random voltage source | 🔵 ✅ | ❌ | ngspice TRRANDOM |
| Arbitrary phase source | ✅ | ✅ | |
| RF Port | ✅ | ✅ | ngspice: `.SP`; Xyce: PORT device + `.LIN` |
| External input (from file) | 🔵 ✅ | ❌ | ngspice `filesource` code model |
| VCVS (E) — linear | ✅ | ✅ | |
| VCCS (G) — linear | ✅ | ✅ | |
| CCCS (F) — linear | ✅ | ✅ | |
| CCVS (H) — linear | ✅ | ✅ | |
| POLY sources (E/G/F/H) | ✅ | ✅ | Polynomial-controlled dependent sources |
| B-source (nonlinear, expr) | ✅ | ✅ | ngspice: `Bxxx`; Xyce: nonlinear dependent source |
| E/G with VALUE/TABLE/LAPLACE | ✅ | ✅ | |
| E/G with FREQ response | ✅ | ⚠️ | Xyce supports TABLE and expressions; FREQ keyword differs |
| E with AND/OR/NAND/NOR logic | 🔵 ✅ | ❌ | ngspice behavioral logic gates on E-source |
| S-domain transfer function (Laplace) | ✅ | ✅ | ngspice: LAPLACE on E/G; Xyce: B-source + LAPLACE |
| Ideal delay | ❌ | ✅ 🟠 | Xyce: dedicated Ideal Delay device (2.3.27) |

---

## 3. Semiconductor Devices

### 3.1 Diode

| Model | ngspice 46 | Xyce 7.10 | Notes |
|-------|-----------|-----------|-------|
| Standard diode (Level 1) | ✅ | ✅ | Shockley model with junction caps |
| Level 2 diode (Xyce extended) | ❌ | ✅ | Requires `LEVEL=2` in Xyce model cards |
| JUNCAP2 (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | CMC standard junction model |
| DIODE_CMC (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | CMC compact diode model |
| Self-heating diode model | 🔵 ✅ | ❌ | Electrothermal coupling in ngspice |
| Separate sidewall diode | 🔵 ✅ | ❌ | |
| Soft reverse recovery | 🔵 ✅ | ❌ | |
| Zener (code model) | 🔵 ✅ | ❌ | ngspice XSPICE `zener` code model |

### 3.2 BJT (Bipolar Junction Transistor)

| Model | ngspice 46 | Xyce 7.10 | Notes |
|-------|-----------|-----------|-------|
| Gummel-Poon (Level 1) | ✅ | ✅ | NPN/PNP, standard SPICE BJT |
| VBIC 1.3 (Level 11/12) | ❌ | ✅ 🟠 | Xyce levels 11 & 12 |
| VBIC (ngspice native) | ✅ | ❌ | ngspice built-in VBIC with self-heating |
| FBH HBT_X (Level 23) | ❌ | ✅ 🟠 | Heterojunction BJT model |
| HICUM/L0 (Level 230) | ❌ | ✅ 🟠 | Xyce built-in |
| HICUM/L0 (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | ngspice via OSDI interface |
| HICUM/L2 (Level 234) | ❌ | ✅ 🟠 | Xyce built-in (requires substrate + thermal node) |
| HICUM/L2 (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | ngspice via OSDI interface |
| MEXTRAM 504 (Level 504) | ❌ | ✅ 🟠 | |
| MEXTRAM 505 (Level 505) | ❌ | ✅ 🟠 | |
| MEXTRAM 504/505 (via OpenVAF) | 🔵 ✅ | ❌ | ngspice via OSDI interface |

### 3.3 JFET (Junction Field-Effect Transistor)

| Model | ngspice 46 | Xyce 7.10 | Notes |
|-------|-----------|-----------|-------|
| Level 1 (SPICE JFET) | ✅ | ✅ | NJF/PJF |
| Level 2 (Parker-Skellern) | ✅ | ❌ | ngspice specific; detailed microwave JFET |
| Parker-Skellern modification (Lv1) | 🔵 ✅ | ❌ | |

### 3.4 MESFET (Metal-Semiconductor FET)

| Model | ngspice 46 | Xyce 7.10 | Notes |
|-------|-----------|-----------|-------|
| Statz model (Level 1) | ✅ | ✅ | NMF/PMF |
| Ytterdal model | 🔵 ✅ | ❌ | |
| hfet1 (Level 5) | 🔵 ✅ | ❌ | HFET model |
| hfet2 (Level 6) | 🔵 ✅ | ❌ | HFET model |

### 3.5 MOSFET

| Model | ngspice 46 | Xyce 7.10 | Notes |
|-------|-----------|-----------|-------|
| Level 1 (SPICE classic) | ✅ | ✅ | NMOS/PMOS |
| Level 2 (SPICE, Meyer cap) | ✅ | ✅ | |
| Level 3 (SPICE, Meyer cap) | ✅ | ✅ | |
| Level 6 (Meyer cap) | ✅ | ✅ | |
| Level 9 / MOS9 (modified Lv3) | ✅ | ✅ | |
| BSIM1 (Level 4) | ✅ | ❌ | Legacy; ngspice only |
| BSIM2 (Level 5) | ✅ | ❌ | Legacy; ngspice only |
| BSIM3 (Level 8/49 ng / Level 9 Xyce) | ✅ | ✅ | ⚠️ Level numbers differ: ng=8/49, Xyce=9 |
| BSIM4 (Level 14/54) | ✅ | ✅ | |
| BSIM-SOI v3.2 (Level 10/58/55–57 ng / Level 10 Xyce) | ✅ | ✅ | Levels differ across simulators |
| BSIM-SOI 4.5.0 (Level 70450) | ❌ | ✅ 🟠 | |
| BSIM-SOI 4.6.1 (Level 70) | ❌ | ✅ 🟠 | |
| SOI3 (Level 60) | 🔵 ✅ | ❌ | |
| BSIM6 v6.1.1 (Level 77) | ❌ | ✅ 🟠 | |
| BSIM-CMG v107 (Level 107) | ❌ | ✅ 🟠 | FinFET |
| BSIM-CMG v108 (Level 108) | ❌ | ✅ 🟠 | FinFET |
| BSIM-CMG v110 (Level 110) | ❌ | ✅ 🟠 | FinFET |
| BSIM-CMG v111 (Level 111) | ❌ | ✅ 🟠 | FinFET |
| BSIM-CMG (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | ngspice via OSDI |
| BSIM-BULK (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | ngspice via OSDI |
| PSP v102.5 (Level 102) | ❌ | ✅ 🟠 | |
| PSP v103.4 (Level 103/1031) | ❌ | ✅ 🟠 | |
| PSP (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | ngspice via OSDI |
| HiSIM (University of Hiroshima) | 🔵 ✅ | ❌ | HiSIM2, HiSIM_HV, HiSIM_SOI |
| EKV 2.6 (Level 260) | ❌ | ✅ 🟠 | |
| EKV 3.0.1 (Level 301) | ❌ | ✅ 🟠 | |
| EKV3 (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | ngspice via OSDI |
| MVS 2.0.0 (Level 2000/2001) | ❌ | ✅ 🟠 | MIT virtual source model |
| MVSG_CMC 1.1.0 (Level 2002) | ❌ | ✅ 🟠 | |
| L_UTSOI v102.4 (Level 10240) | ❌ | ✅ 🟠 | UTBB FD-SOI |
| VDMOS / Power MOSFET | ✅ | ✅ | ngspice: ch.7.7; Xyce: Level 18. Electrothermal in ngspice |

---

## 4. Transmission Lines

| Type | ngspice 46 | Xyce 7.10 | Notes |
|------|-----------|-----------|-------|
| Lossless (ideal) transmission line | ✅ | ✅ | `T` element |
| Lossy TL (LTRA model) | ✅ | ✅ | W/L/R/C/G distributed |
| Uniform distributed RC (URC) | ✅ | ✅ | |
| KSPICE single lossy TL (TXL) | 🔵 ✅ | ❌ | ngspice KSPICE-derived |
| Coupled multiconductor line (CPL) | 🔵 ✅ | ❌ | ngspice KSPICE-derived |
| Lumped transmission line | ❌ | ✅ 🟠 | Xyce: 2.3.26 |
| XSPICE generic TL (code model) | 🔵 ✅ | ❌ | ngspice XSPICE ch.8.5 |
| XSPICE coupled lines (code model) | 🔵 ✅ | ❌ | ngspice XSPICE ch.8.5 |
| XSPICE microstrip line | 🔵 ✅ | ❌ | ngspice XSPICE ch.8.5 |
| Linear device (Y/Z/S-param based) | ❌ | ✅ 🟠 | Xyce: 2.3.24, for S-param black-boxes |

---

## 5. Analyses

| Analysis | ngspice 46 | Xyce 7.10 | Notes |
|----------|-----------|-----------|-------|
| `.OP` — DC operating point | ✅ | ✅ | Xyce `.OP` output limited in parallel mode |
| `.DC` — DC sweep | ✅ | ✅ | |
| `.AC` — small-signal AC | ✅ | ✅ | |
| `.TRAN` — transient | ✅ | ✅ | |
| `.NOISE` — noise | ✅ | ⚠️ | Xyce: not all device noise models implemented yet |
| `.TF` — DC transfer function | 🔵 ✅ | ❌ | Small-signal Vout/Vin, Rin, Rout |
| `.PZ` — pole-zero analysis | 🔵 ✅ | ❌ | Poles and zeros of transfer function |
| `.DISTO` — distortion analysis | 🔵 ✅ | ❌ | Harmonic/intermodulation distortion |
| `.SENS` — sensitivity | ✅ | ✅ | Both DC & AC; Xyce also transient; different syntax |
| `.SP` / `.LIN` — S/Y/Z parameters | ✅ | ✅ | ngspice: `.SP`; Xyce: `.LIN` (TOUCHSTONE output) |
| `.PSS` — periodic steady state | 🔵 ✅ | ❌ | ngspice ch.11.3.12 |
| `.HB` — harmonic balance | ❌ | ✅ 🟠 | Xyce full harmonic balance solver |
| `.FFT` — FFT of transient output | ✅ | ✅ | |
| `.FOUR` — Fourier analysis | ✅ | ✅ | |
| `.STEP` — parametric sweep | ✅ | ✅ | Syntax differs |
| `.SAMPLING` — Monte Carlo / UQ | ❌ | ✅ 🟠 | Xyce: LHS, MC, PCE sampling |
| `.EMBEDDEDSAMPLING` — embedded UQ | ❌ | ✅ 🟠 | Embedded stochastic collocation |
| `.PCE` — polynomial chaos expansion | ❌ | ✅ 🟠 | Fully intrusive PCE |
| `.MC` / `.WCASE` — statistical (PSpice-style) | ❌ | ❌ | Neither supports these directly |

---

## 6. Behavioral / Mixed-Signal Modeling

| Feature | ngspice 46 | Xyce 7.10 | Notes |
|---------|-----------|-----------|-------|
| XSPICE code model framework | 🔵 ✅ | ❌ | ngspice full XSPICE ch.8 with analog, digital, hybrid models |
| XSPICE analog code models | 🔵 ✅ | ❌ | Gain, summer, multiplier, divider, limiter, integrator, differentiator, S-domain TF, PWL source, file source, analog switch, zener, current limiter… |
| XSPICE digital code models | 🔵 ✅ | ❌ | Buffer, inverter, AND/NAND/OR/NOR/XOR/XNOR, tristate, pullup/pulldown, D/JK/T/SR flip-flops, D/SR latches, state machine, frequency divider, RAM, digital source, LUT |
| XSPICE mixed-signal (A/D bridge) | 🔵 ✅ | ❌ | Automatic analog↔digital bridge insertion |
| User-defined node types | 🔵 ✅ | ❌ | ngspice event-driven user nodes |
| Behavioral digital devices | ❌ | ✅ 🟠 | Xyce: 2.3.28 HDL-like digital devices |
| Y-type behavioral digital (deprecated) | ❌ | ✅ 🟠 | Xyce: 2.3.29 |
| Verilog-A (via OpenVAF/OSDI) | 🔵 ✅ | ❌ | ngspice ch.9: compile VA models to shared lib via OpenVAF |
| XSPICE `.if` / `.param` conditional netlist | ✅ | ✅ | ngspice: `.IF`; Xyce: expression-based |
| U devices (basic digital primitives) | 🔵 ✅ | ❌ | ngspice ch.10 |
| HDL digital simulation | 🔵 ✅ | ❌ | ngspice ch.10.3 |

---

## 7. Mixed-Level / TCAD Simulation

| Feature | ngspice 46 | Xyce 7.10 | Notes |
|---------|-----------|-----------|-------|
| CIDER (2D device simulation) | 🔵 ✅ | ❌ | ngspice Part III: NUMD, NBJT, NUMOS; numerical PDE-based device models embedded in SPICE netlist |
| TCAD device (1D/2D PDE solver) | ❌ | ✅ 🟠 | Xyce: ch.2.4 — built-in drift-diffusion PDE solver, physical material/mobility/contact models |

---

## 8. Netlist & Simulation Infrastructure

| Feature | ngspice 46 | Xyce 7.10 | Notes |
|---------|-----------|-----------|-------|
| `.SUBCKT` subcircuits | ✅ | ✅ | |
| `.PARAM` / `.GLOBAL_PARAM` | ✅ | ✅ | |
| `.FUNC` user functions | ✅ | ✅ | |
| `.IF` conditional netlist | ✅ | ✅ | |
| `.INCLUDE` / `.LIB` | ✅ | ✅ | |
| Model binning | ✅ | ✅ | |
| Instance multiplier (`m=`) | ✅ | ✅ | |
| Temperature analysis (`.TEMP`) | ✅ | ⚠️ | ngspice: `.TEMP` line; Xyce: `.STEP TEMP LIST` or `.OPTIONS DEVICE` |
| Interactive mode (CLI shell) | 🔵 ✅ | ❌ | ngspice has full interactive REPL; Xyce is batch-only |
| Parallel execution (MPI) | ❌ | ✅ 🟠 | Xyce designed for parallel HPC; ngspice is single-thread |
| `.MEASURE` / `.MEAS` | ✅ | ✅ | |
| `.NODESET` / `.IC` | ✅ | ✅ | |
| `.SAVE` operating point | ❌ | ✅ | Xyce checkpoint/restart |
| Safe Operating Area (SOA) checks | 🔵 ✅ | ❌ | ngspice ch.11.5 — R, C, diode SOA warnings |
| `.DATA` table sweeps | ❌ | ✅ 🟠 | Xyce-specific data table for parametric sweeps |
| HSPICE compatibility extensions | ✅ | ✅ | Both claim partial HSPICE compatibility |
| `tclspice` / scripting interface | 🔵 ✅ | ❌ | ngspice embeddable as shared library / tclspice |

---

## 9. Key Differences Summary

### ngspice has, Xyce does not

| Feature | ngspice chapter/section |
|---------|------------------------|
| `.TF` transfer function analysis | 11.3.9 |
| `.PZ` pole-zero analysis | 11.3.6 |
| `.DISTO` distortion analysis | 11.3.3 |
| `.PSS` periodic steady state | 11.3.12 |
| XSPICE full code model framework (analog + digital + mixed-signal) | ch.8 |
| Verilog-A models via OpenVAF/OSDI | ch.9 |
| CIDER mixed-level TCAD (NUMD, NBJT, NUMOS) | Part III / ch.26 |
| CMC models: JUNCAP2, DIODE_CMC, PSP, BSIM-BULK, BSIM-CMG, EKV3 (via OSDI) | ch.7 |
| HiSIM MOSFET family | 7.6.6 |
| BSIM1 / BSIM2 legacy MOSFETs | 7.6.3.1–2 |
| JFET Parker-Skellern Level 2 | 7.4.5 |
| MESFET: Ytterdal, hfet1, hfet2 | 7.5.4–5 |
| SOI3 MOSFET (Level 60) | 7.6.5 |
| Transient noise source (TRNOISE) | 4.1.7 |
| Random voltage source (TRRANDOM) | 4.1.8 |
| KSPICE lossy TL (TXL, CPL) | 6.4 |
| Interactive/REPL mode | ch.12–13 |
| Safe Operating Area (SOA) warnings | 11.5 |
| E-source with logic (AND/OR/NAND/NOR) | 5.2.7 |
| tclspice / shared library embedding | ch.19 |

### Xyce has, ngspice does not

| Feature | Xyce section |
|---------|-------------|
| `.HB` harmonic balance analysis | 2.1.13 |
| `.SAMPLING` / `.EMBEDDEDSAMPLING` / `.PCE` — UQ/stochastic analyses | 2.1.33/2.1.5/2.1.27 |
| BSIM-SOI 4.5/4.6 (Levels 70, 70450) | 2.3.20.9 |
| BSIM6 v6.1.1 (Level 77) | 2.3.20.10 |
| BSIM-CMG family (Levels 107–111) built-in | 2.3.20.11–15 |
| PSP v102/103 built-in | 2.3.20.11–12 |
| EKV 2.6 / 3.0.1 built-in (Levels 260, 301) | 2.3.20.18–19 |
| MVS 2.0.0 / MVSG_CMC (Levels 2000–2002) | 2.3.20.16–17 |
| L_UTSOI v102.4 UTBB FD-SOI (Level 10240) | 2.3.20.20 |
| VBIC 1.3 built-in (Levels 11, 12) | 2.3.17.4 |
| FBH HBT_X BJT (Level 23) | 2.3.17.5 |
| HICUM/L0 built-in (Level 230) | 2.3.17.6 |
| HICUM/L2 built-in (Level 234) | 2.3.17.7 |
| MEXTRAM 504/505 built-in | 2.3.17.8 |
| Memristor (TEAM, Yakopcic, PEM) | 2.3.32 |
| Ideal delay device | 2.3.27 |
| Lumped transmission line | 2.3.26 |
| Linear device (S/Y/Z-parameter) | 2.3.24 |
| Accelerated mass (electromechanical) | 2.3.30 |
| Power grid device | 2.3.31 |
| Built-in TCAD/PDE device solver | 2.4 |
| Parallel execution (MPI) | ch.4 |
| Checkpoint / restart (`.SAVE`) | 2.1.34 |
| `.DATA` table parameter sweeps | 2.1.2 |
| Generic switch (expression-controlled) | 2.3.23 |

---

## 10. Notes for Engine Integration

1. **Level numbering mismatch** — BSIM3 is Level 9 in Xyce, Level 8 (or 49) in ngspice. BSIM4 is Level 14/54 in Xyce, Level 14/54 in ngspice (match). BSIM-SOI v3.2 is Level 10 in both (match). Always map level numbers explicitly per simulator when parsing model cards.

2. **`.TF` / `.PZ` / `.DISTO`** — these analyses exist only in ngspice. Any IR that includes them must route exclusively to the ngspice backend.

3. **Harmonic Balance (`.HB`)** — Xyce only. Route HB simulations to Xyce.

4. **UQ / stochastic analyses** — Xyce's `.SAMPLING`, `.EMBEDDEDSAMPLING`, `.PCE` have no ngspice equivalent.

5. **OpenVAF/OSDI** — ngspice supports user-compiled Verilog-A models as shared libraries at runtime. Xyce does not. Any custom VA device model flow must target ngspice.

6. **XSPICE code models** — ngspice's XSPICE framework provides analog, digital, and mixed-signal primitives not available in Xyce. Mixed-signal co-simulation paths must use ngspice.

7. **Parallel / HPC simulation** — Xyce supports MPI-parallel execution; ngspice is single-threaded. Large circuits targeting HPC should route to Xyce.

8. **Interactive mode** — ngspice has a full interactive REPL; Xyce is batch-only. The frontend should not expect interactive control over Xyce processes.

9. **Temperature sweep** — syntax differs: ngspice uses `.TEMP t1 t2 …`; Xyce uses `.STEP TEMP LIST t1 t2 …` or `.OPTIONS DEVICE TNOM=x`.

10. **Noise models** — Xyce's noise implementation is incomplete (stated in its own RG); ngspice has more complete noise coverage across devices.
