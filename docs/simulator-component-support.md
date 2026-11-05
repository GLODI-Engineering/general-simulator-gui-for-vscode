# Simulator Component Support Reference

This is the user-facing reference for component support by simulator.

It follows the compatibility catalog source of truth in:

- `apps/frontend/src/library/simulator-compat.yaml`

If the simulator filter in the UI says a component is available, that support is
defined here.

## How To Read This Document

- `ngspice`: classic SPICE-oriented compatibility set
- `Xyce`: broader circuit-domain set with several Xyce-only blocks
- `SciPy`: signal/control-oriented set, plus the shared `semi.diode` entry present
  in the current compatibility catalog

`All simulators` in the UI is just the union of all simulator lists. It is not a
real solver target.

## Quick Summary

| Simulator | Best for | Notable strengths | Notable exclusions |
|---|---|---|---|
| `ngspice` | Classic SPICE circuits | Standard passive devices, waveform sources, semiconductors, basic tlines | No Xyce-only generic switch, memristor, mechanical mass, power grid, lumped/linear-device tlines, ideal delay |
| `Xyce` | Extended SPICE / larger circuit set | Xyce-only passive blocks, ideal delay, full tline set | No `control.transfer_function`, no ngspice-only noise/random voltage source |
| `SciPy` | Signal/control block diagrams | Signal and control blocks, scope | No passive/source/tline families in the compat list; only `semi.diode` is additionally present in the current catalog |

## Full Support Matrix

Legend:

- `Y` = listed as supported by that simulator in the compatibility catalog
- blank = not listed for that simulator

| Block Key | Plain Name | ngspice | Xyce | SciPy | Example Use | Notes |
|---|---|---:|---:|---:|---|---|
| `signal.constant` | Constant source | Y | Y | Y | Feed a fixed reference value into a controller | Signal-domain block |
| `signal.step` | Step source | Y | Y | Y | Apply a step input to measure transient response | Signal-domain block |
| `control.derivative` | Derivative | Y |  | Y | Differentiate an error signal in a control loop | Excluded from Xyce list |
| `control.gain` | Gain | Y | Y | Y | Multiply a signal by a scalar gain | Signal/control block |
| `control.integrator` | Integrator | Y | Y | Y | Build accumulators or dynamic controllers | Signal/control block |
| `control.pid` | PID controller | Y |  | Y | Close a feedback loop around a plant | Excluded from Xyce list |
| `control.saturation` | Saturation / clamp | Y | Y | Y | Limit actuator command range | Signal/control block |
| `control.sum` | Sum / adder | Y | Y | Y | Add or subtract multiple signals | Signal/control block |
| `control.transfer_function` | Transfer function | Y |  | Y | Model a linear transfer function directly | Not listed for Xyce |
| `sinks.scope` | Scope | Y | Y | Y | Plot or inspect output signals | Shared sink block |
| `passive.resistor` | Resistor | Y | Y |  | Build a basic resistive network | Circuit-domain block |
| `passive.resistor.semiconductor` | Semiconductor resistor model | Y | Y |  | Use resistor model-card behavior | Circuit-domain block |
| `passive.resistor.behavioral` | Behavioral resistor | Y | Y |  | Define resistance-like behavior from an expression/model | Circuit-domain block |
| `passive.capacitor` | Capacitor | Y | Y |  | Build RC filters, decoupling, energy storage | Circuit-domain block |
| `passive.capacitor.semiconductor` | Semiconductor capacitor model | Y | Y |  | Use model-based capacitance behavior | Circuit-domain block |
| `passive.capacitor.behavioral` | Behavioral capacitor | Y | Y |  | Define nonstandard capacitance behavior | Circuit-domain block |
| `passive.inductor` | Inductor | Y | Y |  | Build RL filters, magnetic storage, converters | Circuit-domain block |
| `passive.inductor.behavioral` | Behavioral inductor | Y |  |  | Define custom inductive behavior | Not listed for Xyce |
| `passive.inductor.coupled` | Coupled inductors | Y | Y |  | Model transformers or mutual coupling | Uses `K`, `L1`, `L2` params |
| `passive.switch.voltage` | Voltage-controlled switch | Y | Y |  | Switch a branch based on control voltage | Circuit-domain block |
| `passive.switch.current` | Current-controlled switch | Y | Y |  | Switch a branch based on control current | Circuit-domain block |
| `passive.switch.generic` | Generic switch |  | Y |  | Use Xyce-specific generic switching element | Xyce-only |
| `passive.memristor` | Memristor |  | Y |  | Model memory-resistance devices | Xyce-only |
| `passive.mechanical.mass` | Mechanical mass |  | Y |  | Couple mechanical-domain style mass behavior | Xyce-only in compat catalog |
| `passive.power_grid` | Power grid element |  | Y |  | Model distributed power-grid style behavior | Xyce-only in compat catalog |
| `source.voltage.dc` | DC voltage source | Y | Y |  | Bias a circuit with a fixed voltage | Circuit-domain source |
| `source.voltage.pulse` | Pulse voltage source | Y | Y |  | Drive a switching waveform into a circuit | Circuit-domain source |
| `source.voltage.sin` | Sinusoidal voltage source | Y | Y |  | Apply an AC-like sine excitation | Circuit-domain source |
| `source.voltage.exp` | Exponential voltage source | Y | Y |  | Model exponential turn-on/turn-off profiles | Circuit-domain source |
| `source.voltage.pwl` | Piecewise-linear voltage source | Y | Y |  | Define arbitrary time-voltage breakpoints | Circuit-domain source |
| `source.voltage.sffm` | Single-frequency FM voltage source | Y | Y |  | Model frequency-modulated voltage excitation | Circuit-domain source |
| `source.voltage.am` | AM voltage source | Y | Y |  | Model amplitude-modulated voltage excitation | Circuit-domain source |
| `source.voltage.noise` | Noise voltage source | Y |  |  | Inject noise into a circuit input | ngspice-only |
| `source.voltage.random` | Random voltage source | Y |  |  | Drive randomized time-domain voltage input | ngspice-only |
| `source.voltage.rf_port` | RF port | Y | Y |  | Define a port for RF or S-parameter style studies | Circuit-domain source |
| `source.current.dc` | DC current source | Y | Y |  | Bias a branch with fixed current | Circuit-domain source |
| `source.current.pulse` | Pulse current source | Y | Y |  | Drive pulsed current into a network | Circuit-domain source |
| `source.current.sin` | Sinusoidal current source | Y | Y |  | Apply sinusoidal current excitation | Circuit-domain source |
| `source.current.exp` | Exponential current source | Y | Y |  | Model exponential current transients | Circuit-domain source |
| `source.current.pwl` | Piecewise-linear current source | Y | Y |  | Define arbitrary current-vs-time waveform | Circuit-domain source |
| `source.current.sffm` | Single-frequency FM current source | Y | Y |  | Model FM current excitation | Circuit-domain source |
| `source.current.am` | AM current source | Y | Y |  | Model AM current excitation | Circuit-domain source |
| `source.dependent.vcvs` | Voltage-controlled voltage source | Y | Y |  | Amplify a measured control voltage into an output voltage | SPICE `E` source |
| `source.dependent.vccs` | Voltage-controlled current source | Y | Y |  | Turn a sensed voltage into output current | SPICE `G` source |
| `source.dependent.cccs` | Current-controlled current source | Y | Y |  | Mirror or scale a controlling current | SPICE `F` source |
| `source.dependent.ccvs` | Current-controlled voltage source | Y | Y |  | Turn a sensed current into output voltage | SPICE `H` source |
| `source.dependent.vcvs.poly` | Polynomial VCVS | Y | Y |  | Model higher-order voltage-controlled voltage behavior | Listed in compat catalog |
| `source.dependent.vccs.poly` | Polynomial VCCS | Y | Y |  | Model higher-order voltage-controlled current behavior | Listed in compat catalog |
| `source.dependent.cccs.poly` | Polynomial CCCS | Y | Y |  | Model higher-order current-controlled current behavior | Listed in compat catalog |
| `source.dependent.ccvs.poly` | Polynomial CCVS | Y | Y |  | Model higher-order current-controlled voltage behavior | Listed in compat catalog |
| `source.behavioral` | Behavioral source | Y | Y |  | Enter an expression-based source law | Circuit-domain source |
| `source.ideal_delay` | Ideal delay source |  | Y |  | Delay a source waveform by a fixed time | Xyce-only |
| `semi.diode` | Diode | Y | Y | Y | Rectify a signal or build a diode clamp | Present in all three compat lists |
| `semi.diode.zener` | Zener diode | Y | Y |  | Build a voltage clamp or reference limiter | ngspice/Xyce compat |
| `semi.bjt.npn` | NPN BJT | Y | Y |  | Build transistor amplifiers or switches | Circuit-domain semiconductor |
| `semi.bjt.pnp` | PNP BJT | Y | Y |  | Build complementary transistor stages | Circuit-domain semiconductor |
| `semi.jfet.n` | N-channel JFET | Y | Y |  | Model JFET input or analog switching behavior | Circuit-domain semiconductor |
| `semi.jfet.p` | P-channel JFET | Y | Y |  | Model complementary JFET behavior | Circuit-domain semiconductor |
| `semi.mesfet.n` | N-channel MESFET | Y | Y |  | Model microwave / MESFET-style transistor behavior | Circuit-domain semiconductor |
| `semi.mosfet.n` | NMOS | Y | Y |  | Build CMOS or switching power stages | Circuit-domain semiconductor |
| `semi.mosfet.p` | PMOS | Y | Y |  | Build complementary CMOS / PMOS stages | Circuit-domain semiconductor |
| `semi.mosfet.vdmos` | VDMOS | Y | Y |  | Model power MOSFET behavior | Circuit-domain semiconductor |
| `tline.lossless` | Lossless transmission line | Y | Y |  | Model an ideal transmission delay line | Circuit-domain tline |
| `tline.lossy` | Lossy transmission line (LTRA) | Y | Y |  | Model distributed lossy interconnects | Circuit-domain tline |
| `tline.urc` | Uniform RC line | Y | Y |  | Model distributed RC effects in a line | Circuit-domain tline |
| `tline.lumped` | Lumped transmission line |  | Y |  | Approximate a line as lumped sections | Xyce-only |
| `tline.linear_device` | Linear device / S-parameter device |  | Y |  | Use a Touchstone-based linear network | Xyce-only |

## Support By Simulator

This section repeats the same information grouped the way most users browse it.

### ngspice

Supported families:

- signal: `signal.constant`, `signal.step`
- control: `control.derivative`, `control.gain`, `control.integrator`,
  `control.pid`, `control.saturation`, `control.sum`,
  `control.transfer_function`
- sinks: `sinks.scope`
- passive: `passive.resistor`, `passive.resistor.semiconductor`,
  `passive.resistor.behavioral`, `passive.capacitor`,
  `passive.capacitor.semiconductor`, `passive.capacitor.behavioral`,
  `passive.inductor`, `passive.inductor.behavioral`,
  `passive.inductor.coupled`, `passive.switch.voltage`,
  `passive.switch.current`
- voltage sources: `source.voltage.dc`, `source.voltage.pulse`,
  `source.voltage.sin`, `source.voltage.exp`, `source.voltage.pwl`,
  `source.voltage.sffm`, `source.voltage.am`, `source.voltage.noise`,
  `source.voltage.random`, `source.voltage.rf_port`
- current sources: `source.current.dc`, `source.current.pulse`,
  `source.current.sin`, `source.current.exp`, `source.current.pwl`,
  `source.current.sffm`, `source.current.am`
- dependent sources: `source.dependent.vcvs`, `source.dependent.vccs`,
  `source.dependent.cccs`, `source.dependent.ccvs`,
  `source.dependent.vcvs.poly`, `source.dependent.vccs.poly`,
  `source.dependent.cccs.poly`, `source.dependent.ccvs.poly`
- other sources: `source.behavioral`
- semiconductor: `semi.diode`, `semi.diode.zener`, `semi.bjt.npn`,
  `semi.bjt.pnp`, `semi.jfet.n`, `semi.jfet.p`, `semi.mesfet.n`,
  `semi.mosfet.n`, `semi.mosfet.p`, `semi.mosfet.vdmos`
- tline: `tline.lossless`, `tline.lossy`, `tline.urc`

Common ngspice examples:

- RC transient: `source.voltage.pulse + passive.resistor + passive.capacitor`
- analog amplifier: `source.voltage.sin + semi.bjt.npn + passive.resistor`
- nonlinear source injection: `source.behavioral`

### Xyce

Supported families:

- signal: `signal.constant`, `signal.step`
- control: `control.gain`, `control.integrator`, `control.saturation`,
  `control.sum`
- sinks: `sinks.scope`
- passive: `passive.resistor`, `passive.resistor.behavioral`,
  `passive.resistor.semiconductor`, `passive.capacitor`,
  `passive.capacitor.semiconductor`, `passive.capacitor.behavioral`,
  `passive.inductor`, `passive.inductor.coupled`,
  `passive.switch.voltage`, `passive.switch.current`,
  `passive.switch.generic`, `passive.memristor`,
  `passive.mechanical.mass`, `passive.power_grid`
- voltage sources: `source.voltage.dc`, `source.voltage.pulse`,
  `source.voltage.sin`, `source.voltage.exp`, `source.voltage.pwl`,
  `source.voltage.sffm`, `source.voltage.am`, `source.voltage.rf_port`
- current sources: `source.current.dc`, `source.current.pulse`,
  `source.current.sin`, `source.current.exp`, `source.current.pwl`,
  `source.current.sffm`, `source.current.am`
- dependent sources: `source.dependent.vcvs`, `source.dependent.vccs`,
  `source.dependent.cccs`, `source.dependent.ccvs`,
  `source.dependent.vcvs.poly`, `source.dependent.vccs.poly`,
  `source.dependent.cccs.poly`, `source.dependent.ccvs.poly`
- other sources: `source.behavioral`, `source.ideal_delay`
- semiconductor: `semi.diode`, `semi.diode.zener`, `semi.bjt.npn`,
  `semi.bjt.pnp`, `semi.jfet.n`, `semi.jfet.p`, `semi.mesfet.n`,
  `semi.mosfet.n`, `semi.mosfet.p`, `semi.mosfet.vdmos`
- tline: `tline.lossless`, `tline.lossy`, `tline.urc`, `tline.lumped`,
  `tline.linear_device`

Common Xyce examples:

- power-switch network: `passive.switch.generic` with source and passive devices
- delayed drive path: `source.ideal_delay`
- line and interconnect study: `tline.lumped` or `tline.linear_device`

### SciPy

Supported families:

- signal: `signal.constant`, `signal.step`
- control: `control.derivative`, `control.gain`, `control.integrator`,
  `control.pid`, `control.saturation`, `control.sum`,
  `control.transfer_function`
- sinks: `sinks.scope`
- semiconductor: `semi.diode`

Common SciPy examples:

- closed-loop control demo: `signal.step + control.pid + control.integrator + sinks.scope`
- signal-shaping chain: `signal.constant + control.gain + control.saturation`

## Practical Selection Advice

Choose `ngspice` when you want:

- classic SPICE devices and sources
- noise and random voltage sources
- standard semiconductors and basic transmission lines

Choose `Xyce` when you want:

- Xyce-only devices such as memristor, generic switch, ideal delay
- the broadest transmission-line coverage
- extended circuit-domain library filtering in the frontend

Choose `SciPy` when you want:

- signal/control diagrams rather than full SPICE circuits
- gains, integrators, transfer functions, PID, and scopes

## Caveat About Support Meaning

This document is tied to the compatibility catalog used by the frontend library
filter. That means “supported” here means the project currently advertises the
component as available for that simulator in the library filter.

For circuit-domain blocks, backend execution support also depends on the backend
solver mapping and netlist writer.

## Related Technical Doc

For implementation details and maintenance rules, see:

- `docs/simulator-component-integration.md`
