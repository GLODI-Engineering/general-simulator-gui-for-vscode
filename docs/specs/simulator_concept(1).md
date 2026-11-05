# Unified Power Electronics Simulator — Concept Notes

> Living document. Updated as ideas develop.

---

## Core Architecture Idea

All simulators (SPICE, the block-diagram convention, a commercial piecewise-linear simulator, OpenModelica) ultimately reduce to solving a DAE/ODE system:

**F(ẋ, x, u, t) = 0**

The insight: if a front-end compiler can convert any model representation (circuit netlist, block diagram, transfer function, etc.) into this DAE form, any standard solver backend can run it — scipy Radau, Sundials IDA, a numerical computing environment ode15s, Julia DifferentialEquations.jl, etc. The solver is interchangeable.

### Compilation pipeline

```
[Schematic / block diagram editor]
         ↓
[Front-end compiler]
   - MNA stamping for circuit elements (R, L, C, switches, semiconductors)
   - State-space conversion for transfer function blocks
   - Equation generation for behavioral blocks (PID, hysteresis, LUT, etc.)
         ↓
[Symbolic processor]
   - BLT sorting (find computation order, avoid algebraic loops)
   - Index reduction (Pantelides algorithm for high-index DAEs)
   - Tearing (break remaining algebraic loops)
   - Switch mode enumeration (precompute MNA matrix per switch config)
         ↓
[DAE/ODE solver]  ← interchangeable backend
   - scipy solve_ivp (Radau for stiff systems)
   - Sundials IDA / CVODE
   - a numerical computing environment ode15s
   - Julia DifferentialEquations.jl
         ↓
[Results / waveform viewer]
```

---

## Target Domain

**Power electronics engineers** — the primary pain point is that existing tools force a choice:

- SPICE (a reference SPICE, Qorvo): real device physics, but no control blocks. Making a PID is painful (must use op-amp circuits). No transfer function blocks.
- block-diagram: easy control blocks, but ideal switches only — no switching transients, no parasitics, no real device models.

This tool bridges the gap.

---

## Key Feature: Multi-Level Abstraction with Downward Synthesis

### The big idea

Users work at the **abstraction level they need**, and the software can **synthesize downward** to a more physical implementation on demand.

#### Example 1 — PID block → op-amp circuit

User places a PID block in their schematic (high-level, like the block-diagram convention).
When ready, they click "synthesize to circuit" and the software:
1. Takes the PID parameters (Kp, Ki, Kd)
2. Generates the equivalent analog op-amp topology (inverting summer + integrator + differentiator)
3. Calculates all resistor and capacitor values analytically
4. Inserts the full op-amp subcircuit into the schematic, replacing the block
5. User can now simulate the real analog controller with op-amp bandwidth, slew rate, rail saturation

#### Example 2 — PID block → C / C++ / Python code

Same PID block, different synthesis target: the user clicks "export to code" and selects a language.
The software generates a discrete-time implementation of the block, ready to deploy on a DSP or microcontroller.

**C output example** (for TI C2000, STM32, etc.):
```c
// Auto-generated PID — Kp=1.2, Ki=0.5, Kd=0.01, Ts=100us
typedef struct { float integrator; float prev_error; } PID_State;

float pid_update(PID_State *s, float error, float Ts) {
    s->integrator += error * Ts;
    float derivative = (error - s->prev_error) / Ts;
    s->prev_error = error;
    return 1.2f * error + 0.5f * s->integrator + 0.01f * derivative;
}
```

**Python output example** (for rapid prototyping / HIL):
```python
# Auto-generated PID — Kp=1.2, Ki=0.5, Kd=0.01
class PID:
    def __init__(self): self.integrator = 0; self.prev_error = 0
    def update(self, error, Ts):
        self.integrator += error * Ts
        derivative = (error - self.prev_error) / Ts
        self.prev_error = error
        return 1.2*error + 0.5*self.integrator + 0.01*derivative
```

This applies to **any block**, not just PID:
- Transfer function → discrete-time state-space (Tustin/bilinear discretization) in C/C++/Python
- Hysteresis block → C struct with state variable
- 2nd order sensor TF → IIR filter coefficients + implementation
- State machine → switch/case in C, or if/elif in Python
- Full control chain (sensor TF → PID → PWM modulator) → complete firmware module

**Key insight**: the same block that runs in simulation can be exported as the firmware that runs on the real hardware. No manual reimplementation. This is what QSPICE users are doing manually today — writing C blocks by hand that mirror their simulation logic. This tool makes it automatic and bidirectional.

#### Example 3 — 2nd order transfer function → passive/active filter circuit

User places H(s) = ωn² / (s² + 2ζωn·s + ωn²) as a block.
Software synthesizes a Sallen-Key or MFB active filter with calculated R/C values.

#### Example 4 — Ideal switch → real MOSFET + gate drive

User simulates with ideal switch first (fast).
When ready, software replaces it with a selected MOSFET model + gate resistor + bootstrap circuit.

### Abstraction levels (from high to low)

| Level | Representation | Example |
|---|---|---|
| 0 — Behavioral | Math blocks | TF block, PID block, hysteresis block |
| 1 — Functional | Averaged models | Averaged switch model, CCM/DCM model |
| 2 — Circuit (ideal) | Ideal switches + passives | a commercial piecewise-linear simulator-style |
| 3 — Circuit (physical) | Real device models + parasitics | a reference SPICE-style |

User can simulate at any level and synthesize in two directions:
- **Downward** → more physical (block → op-amp circuit → real MOSFET)
- **Sideways** → code export (block → C / C++ / Python firmware)

---

## Planned Block Library

### Control / signal blocks
- PID controller (with anti-windup, output limits)
- Transfer function (arbitrary order — state-space realization internally)
- 2nd order TF (sensor modeling: accelerometer, current sensor bandwidth, etc.)
- Integrator (with IC and limits)
- Hysteresis / Schmitt trigger
- Lookup table (1D and 2D)
- Adder, gain, saturation, rate limiter
- State machine / logic

### Power stage blocks
- Ideal switch (with PWM firing input)
- Diode (ideal → real)
- Inductor (linear → saturable)
- Capacitor (linear → with ESR/ESL)
- Transformer (ideal → with magnetizing inductance, leakage)
- Standard converter topologies (buck, boost, buck-boost, flyback, LLC, DAB...)

### Synthesis targets (auto-generated circuits)
- PID → op-amp implementation (TL07x, LM358, or user-specified op-amp)
- 2nd order TF → Sallen-Key or MFB filter
- Comparator block → real comparator + hysteresis resistors
- Voltage reference block → TL431 circuit
- More to be defined...

---

---

## Research: Why Engineers Are Leaving a reference SPICE for QSPICE

*Verbatim research findings from web search — unmodified*

---

### The backstory first

QSPICE was created by Mike Engelhardt — the same engineer who originally wrote a reference SPICE 25 years ago. He describes it as "basically what I would have written 25 years ago when I wrote a reference SPICE had I known then what I know now" — a complete rearchitecting of the timestep control, elimination of singularities and device IV curve discontinuities, and advancement of numerical methods over Berkeley SPICE.

So this isn't a competitor product — it's the original author fixing the things that always bothered him about his own tool.

---

### Reason 1 — Modern converters have digital control, and a reference SPICE can't simulate it properly

This is the core driver. Historically, power engineers worked with analog control loops and silicon MOSFETs. Today, digital control algorithms and silicon carbide are areas of intensive research and development. As Qorvo's Jeff Strang put it: "Analog SPICE engines can't simulate complex digital circuits."

What this means in practice: if you're designing a totem-pole PFC, an LLC with frequency modulation, a bidirectional EV charger, or a motor drive — your real controller is a DSP (TI C2000, STM32, etc.) running a firmware control loop. In a reference SPICE, you can only approximate this with behavioral voltage sources and analog blocks. It's a hack. The behavior of the discrete-time sampling, the interrupt timing, the dead-time insertion logic — none of it maps cleanly.

QSPICE offers a versatile modeling language that allows users to input C code directly into simulations, compiled to native Intel object code for fast processing. This enables simulation of complex mixed-signal designs with virtually unlimited digital components, outperforming older SPICE tools.

Your fellow engineer's experience is exactly this: he writes his controller in C, the same language he'll eventually deploy on the DSP, and drops it as a block into the SPICE schematic. The power stage is real SPICE physics, the controller is real C code.

---

### Reason 2 — What engineers actually do with the C block

From the QSPICE forum, a real-world example: one engineer simulated a totem-pole PFC with digital control, using a C block to simulate the discrete controller as well as detailed PWM timing that mimics TI-C2000 PWM block behavior — including dead-time insertion and additional gating logic. The result: a 2-second simulation completed in 27 seconds at 65 kHz switching frequency, comparable in speed to a commercial converter simulator/a commercial piecewise-linear simulator.

This is significant — they're not just implementing a PID. They're replicating the exact behavior of a specific DSP peripheral (the C2000 ePWM module) including its asymmetries. That level of fidelity is simply impossible in a reference SPICE.

Engineers are also using C blocks to simulate LLC resonant converters with frequency modulation — writing the frequency calculation algorithm in C that runs inside the SPICE simulation, controlling the switching frequency dynamically just as a real DSP firmware would.

---

### Reason 3 — a reference SPICE stagnated

a reference SPICE's development seemed to have reached a standstill after Analog Devices acquired it, leaving a void in the community. The interface hadn't changed significantly in over a decade. No Python integration, no digital logic support beyond basic behavioral modeling, no GPU-accelerated waveform rendering.

A 2024 industry survey of 1,200 electronics designers found that 68% of regular a reference SPICE users try at least one alternative simulation tool every 12 months. Common reasons include outdated user interfaces, missing modern component libraries, and lack of collaboration features.

---

### Reason 4 — Speed and numerical robustness

QSPICE benchmarking tests produced a 100% completion rate on stress-test circuits, compared to a failure rate of up to 15% with the same circuits in comparative SPICE simulators. a reference SPICE convergence failures on switching circuits with complex control are a known frustration — engineers spend hours tweaking `.options` parameters trying to get a simulation to converge.

---

### What this confirms about your software idea

The QSPICE phenomenon validates your intuition precisely. Look at what engineers are building with the C block:

- PID controllers with anti-windup, clamping, discrete-time implementation
- DSP peripheral emulation (ePWM dead-time, phase-shifted full bridge timing)
- LLC frequency modulation algorithms
- Battery management state machines
- MPPT algorithms for solar inverters
- Motor drive FOC (Field Oriented Control) with Park/Clarke transforms

There's already a GitHub repository dedicated to power electronics projects in QSPICE with a focus on digital control using C++ blocks, alongside a modular C++ library for power electronics control including IIR filters, PWM generators (bipolar, centered, edge-aligned), and QSPICE integration tools.

The community is essentially building — from scratch, manually, in raw C++ — the block library that your software would provide natively as drag-and-drop components. Every engineer is reinventing the same PID block, the same 2nd-order filter block, the same PWM generator. That's the gap your tool fills.

The difference your concept adds on top of QSPICE:

| QSPICE today | Your concept |
|---|---|
| Write C++ manually for every block | Pre-built PID, TF, hysteresis, sensor blocks |
| No synthesis — C stays C | Synthesize block → real op-amp circuit automatically |
| No abstraction levels | Simulate at system level, then drill down to circuit level |
| Windows only, closed ecosystem | Potentially cross-platform, open architecture |
| No automatic component value calculation | Software computes R, C values from block parameters |
| No code export | Blocks export to C / C++ / Python firmware automatically |

---

## Market Validation — The QSPICE Signal

QSPICE (Qorvo, 2023) was created by Mike Engelhardt — the original author of a reference SPICE — precisely because modern power electronics outgrew what a reference SPICE could express. Key findings:

**Why engineers are moving away from a reference SPICE:**
- Modern converters (totem-pole PFC, LLC, EV chargers, motor drives) use DSP-based digital control. a reference SPICE has no way to simulate a discrete-time control loop faithfully.
- a reference SPICE stagnated after the Analog Devices acquisition — no Python integration, no digital logic, aging GUI.
- Convergence failures on complex switching circuits are a chronic problem.
- A 2024 survey of 1,200 electronics designers found 68% try at least one alternative tool every 12 months.

**What QSPICE's C block unlocks (and what engineers are doing with it today):**
- Simulating TI C2000 ePWM peripheral behavior exactly — including dead-time, phase-shift, asymmetric timing
- LLC frequency modulation controllers written in C, running inside SPICE
- Full totem-pole PFC with discrete-time digital control — 2s simulation at 65kHz completed in 27s wall time
- IIR filter implementations, PWM generators, MPPT algorithms, FOC motor control

**The gap this tool fills:** QSPICE users are building these C blocks manually, reinventing the same PID, filter, and PWM blocks from scratch every time. There is no shared library. A tool that provides these as first-class drag-and-drop blocks — and can auto-generate the C/C++/Python code from the same block — directly addresses this pain.

---

## Synthesis Targets — Full Matrix

Every behavioral block can be synthesized into multiple output forms:

| Block | → Analog circuit | → C code | → C++ class | → Python class |
|---|---|---|---|---|
| PID | Op-amp topology + R/C values | Struct + update() | Class with update() | Class with update() |
| Transfer function (any order) | Sallen-Key / MFB filter | Discrete state-space (Tustin) | Same | Same |
| 2nd order TF (sensor model) | Active filter | IIR coefficients + loop | Same | Same |
| Hysteresis | Comparator + R divider | State variable + threshold logic | Same | Same |
| Integrator | Op-amp integrator + R/C | Accumulator with limits | Same | Same |
| PWM modulator | Comparator + triangle gen | Timer register config | Same | Same |
| State machine | Logic gates / flip-flops | switch/case | Same | if/elif |

**Code export details:**
- Discretization method selectable by user: Tustin (bilinear), Forward Euler, Backward Euler, ZOH
- Sampling time Ts: from simulation timestep or explicit parameter
- Options: anti-windup, output clamping, bumpless transfer
- MCU-specific templates: TI C2000, STM32 HAL, Arduino — same algorithm, different peripheral wrappers
- Full chain export: sensor TF → PID → PWM modulator compiles to one self-contained firmware module

**Key principle:** the block that runs in simulation IS the firmware. No manual reimplementation step.
This is what QSPICE users do manually today (write C blocks that mirror their control logic).
This tool makes it automatic and bidirectional.

---

## Open Questions / To Explore

- Which solver library to use as primary backend? (Sundials via Python bindings seems strongest)
- GUI framework for schematic entry?
- How to handle switch events / zero-crossing detection in the hybrid DAE?
- Device model library — use existing SPICE .lib files directly, or build own format?
- Analog synthesis rules: how to handle op-amp selection (bandwidth must exceed PID crossover frequency × 10, etc.)
- Code synthesis: how to handle fixed-point vs floating-point output for embedded targets?
- Code synthesis: MCU-specific templates — how many targets to support at launch? (C2000, STM32 are the obvious first two)
- Should the tool support importing existing C/C++ blocks (like QSPICE) and reverse-synthesizing them into visual blocks?
- Bidirectional sync: if user edits the generated code, can changes flow back into the block parameters?

---

*Last updated: session 2*
