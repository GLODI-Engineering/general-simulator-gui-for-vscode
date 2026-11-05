# Hybrid Simulation: Coupling the Physical DAE Layer to the Control ODE Layer

## 1. Two Paradigms, One Solver

Modern simulation environments like MATLAB/Simulink+Simscape combine two mathematically distinct modeling paradigms under a single solver. Understanding why they differ, and how they are reconciled, is essential for building reliable hybrid simulators.

**The physical layer** (Simscape, SPICE-like solvers) models networks of real components — inductors, capacitors, switches, mechanical elements. It is *acausal*: connections carry both a "through" variable (current, force, flow) and an "across" variable (voltage, displacement, pressure) simultaneously, and the solver decides which quantities are inputs and which are outputs based on global network topology. The governing equations are assembled automatically from the graph of connections and take the form of **Differential-Algebraic Equations (DAEs)**.

**The control layer** (Simulink block diagrams, transfer functions, state-space blocks) models signal processing and feedback logic. It is *causal*: every block has explicit inputs and outputs, and signal flow direction is fixed by the engineer at design time. The governing equations are **Ordinary Differential Equations (ODEs)**, typically in explicit state-space form.

Combining both produces a **coupled DAE+ODE system**, where the two layers exchange information through well-defined coupling constraints at their interface.

---

## 2. Equation Structure of Each Layer

### 2.1 The Physical Layer: Implicit DAE

When a physical network is compiled, the solver applies graph-theoretic methods (such as the Pantelides algorithm) to assemble a system of equations from:

- **Constitutive relations** of each component (e.g., `v = L · di/dt`, `i = C · dv/dt`, `v = R · i`)
- **Kirchhoff's current law (KCL)** at every node
- **Kirchhoff's voltage law (KVL)** for every loop

The result is an implicit DAE of the general form:

```
F(ẋ_p, x_p, u_p, t) = 0
```

where `x_p` is the vector of physical states (inductor currents, capacitor voltages), `ẋ_p` their time derivatives, `u_p` the external inputs to the physical network (e.g., gate drive signals from the control layer), and `t` is time.

The implicit form — with `F = 0` rather than `ẋ_p = f(...)` — arises because algebraic constraints (KCL, KVL) are mixed with differential equations. The solver cannot always isolate `ẋ_p` analytically; it must solve the full implicit system at each time step.

The **DAE index** characterizes the mathematical difficulty: index 1 systems are relatively tractable, while higher indices require constraint differentiation before numerical integration is possible. Physical networks with switches or direct algebraic paths between state variables can exhibit index > 1, which the solver handles through automatic index reduction.

### 2.2 The Control Layer: Explicit ODE

A transfer function `C(s)` or PID compensator is realized as a state-space system:

```
ẋ_c = A · x_c + B · u_c
y_c = C · x_c + D · u_c
```

where `x_c` is the controller state vector, `u_c` the control input (e.g., the sensed output voltage error), and `y_c` the control output (e.g., the duty cycle command). This is an **explicit ODE**: the right-hand side is a direct function of the current state, with no implicit algebraic constraints.

---

## 3. The Coupling Constraints

The two layers are connected at two interface points, each implemented by a domain-conversion block:

**Sensing (PS → Simulink):** A physical quantity (e.g., the output voltage `V_out`) is read from the physical network and converted into a dimensionless signal for the control layer. This imposes:

```
u_c = g(x_p)
```

The sensed quantity is an algebraic function of the physical states. No dynamics are introduced at this interface, but a unit scaling is applied.

**Actuation (Simulink → PS):** The control output (e.g., a PWM duty cycle `d`) is converted into a physical excitation (e.g., a gate drive signal). This imposes:

```
u_p = h(y_c) = h(C · x_c + D · u_c)
```

The physical network receives a forcing term that depends on the current controller state and, through `u_c`, on the physical states themselves.

Together, these two constraints close the feedback loop and couple the two equation systems.

---

## 4. The Unified System

Substituting the coupling constraints into both equation sets yields the full coupled system solved at runtime:

```
Physical layer (DAE):
    F(ẋ_p, x_p, h(y_c), t) = 0

Control layer (ODE):
    ẋ_c = A · x_c + B · g(x_p)
    y_c = C · x_c + D · g(x_p)

Coupling:
    u_c = g(x_p)           [sensing]
    u_p = h(y_c)           [actuation]
```

The solver treats this as **one unified DAE** over the combined state vector `[x_p, x_c]`. The ODE blocks from the control layer are a special case of DAEs (index 0, fully explicit), so they integrate naturally into the DAE framework. The unified system retains the implicit character imposed by the physical network, and the solver must handle both layers simultaneously at each time step.

---

## 5. Practical Implications

### 5.1 Stiffness

The physical network and the control loop typically operate on very different time scales. Switching transients in a power converter may occur in nanoseconds, while the control bandwidth spans kilohertz. When both are integrated in the same state vector, the combined system is **stiff**: the solver must take small steps governed by the fast physical dynamics even when the control states are evolving slowly. A stiff solver (e.g., `ode15s`, `ode23t`) is mandatory.

### 5.2 Switched Systems and Re-Initialization

A switch opening or closing is not a smooth parameter change — it is a structural change to the DAE itself. The set of active equations changes discontinuously, and the state vector may acquire new algebraic constraints (or lose them). The solver must:

1. Detect the switching event (zero-crossing detection)
2. Halt integration
3. Re-solve for **consistent initial conditions** satisfying the new equation set
4. Resume integration from the new consistent state

This re-initialization step is the primary reason fixed-step solvers are unsuitable for power electronics simulation.

### 5.3 Algebraic Loops at the Boundary

If the feedback path is purely algebraic — that is, if `V_out` flows through the compensator, PWM block, gate drive, and back to influence `V_out` in a single step with no delay — the coupled system contains a **zero-delay algebraic loop**. This raises the effective DAE index and may cause solver failure.

In practice, the PWM modulator naturally breaks this loop: comparing the duty cycle command against a carrier ramp introduces at least a half-switching-cycle delay. If no such natural break exists, an explicit transport delay or a unit sample delay must be inserted at the boundary.

### 5.4 Linearization

Extracting a linear model for loop gain or frequency response analysis requires linearizing the full coupled system around an operating point. Two complications arise:

- The switching element is discontinuous and must be replaced by its averaged or fixed-operating-point equivalent before the Jacobian can be computed.
- The implicit DAE must be internally converted to an explicit ODE representation before standard linearization algorithms apply.

Tools such as MATLAB's `linearize` function handle this automatically, but the result is only valid in a neighborhood of the chosen operating point.

### 5.5 Index Management

The cleanest hybrid architectures keep the DAE index at 1 by ensuring that:

- The physical network has no purely algebraic loops (no path from input to output with zero energy storage)
- The coupling constraints do not introduce additional algebraic dependencies
- The control layer contains at least one dynamic element (an integrator or filter) in the feedback path, preventing a direct algebraic path from output to input

---

## 6. Summary

| Aspect | Physical Layer (DAE) | Control Layer (ODE) |
|---|---|---|
| Causality | Acausal | Causal |
| Equation form | Implicit: `F(ẋ, x, u, t) = 0` | Explicit: `ẋ = Ax + Bu` |
| Equation source | Network topology + component laws | Block diagram + transfer functions |
| State variables | Inductor currents, capacitor voltages | Controller internal states |
| Inputs | Gate signals from control layer | Sensed physical quantities |

The coupling constraints — one for sensing, one for actuation — transform what would be two separate simulation problems into a single unified DAE over the combined state space. The solver integrates both layers simultaneously, with the physical network's stiffness and switching events governing the overall integration strategy. A clean, well-defined interface between the two domains — with explicit unit scaling, natural loop-breaking elements, and awareness of index implications — is what makes the hybrid simulation tractable.
