# Component Parameterization by Nature (ngspice + Xyce)

This guide describes **how each component should be parameterized** based on its physical/behavioral nature, so CAD symbols and property panels can be generated correctly.

Primary references:
- ngspice manual (`ngspice-46-manual.md`)
- Xyce Reference Guide 7.10 (`Xyce_RG.md`)

---

## 1) Core principle

Every component should be described by:

1. **Topology**: pin count and pin roles (`R` is 2-pin, `M` is 4-pin, etc.)
2. **Nature**: passive, source, controlled source, semiconductor, switch, transmission line, digital, TCAD
3. **Parameter family**: scalar value, model+geometry, waveform function, expression, table, or external file/model

---

## 2) Passive elements

## Resistor (`R`)
- **Nature**: dissipative passive
- **Primary parameter**: resistance
- **Typical units**: `ohm`, `k`, `meg`
- **Examples**:
  - `R1 n1 n2 1k`
  - `R2 n1 n2 modelR L=10u W=1u` (geometry/model-driven)
  - behavioral form: `R=expression`
- **CAD fields**:
  - `R` (required in fixed mode)
  - optional `model`, `L`, `W`, temp/noise coefficients

## Capacitor (`C`)
- **Nature**: energy storage (electric field)
- **Primary parameter**: capacitance
- **Units**: `F`, `uF`, `nF`, `pF`
- **Examples**:
  - `C1 n1 n2 10u`
  - `C2 n1 n2 modelC L=10u W=1u`
  - behavioral: `C=expression` or charge form `Q=expression`
- **CAD fields**:
  - `C`
  - optional `IC` initial voltage
  - optional model/geometry/temp coefficients

## Inductor (`L`)
- **Nature**: energy storage (magnetic field)
- **Primary parameter**: inductance
- **Units**: `H`, `mH`, `uH`
- **Examples**:
  - `L1 n1 n2 1uH`
  - `L2 n1 n2 modelL`
  - behavioral: `L=expression`
- **CAD fields**:
  - `L`
  - optional `IC` initial current
  - optional model/geometry/turns/temp params

## Mutual coupling (`K`)
- **Nature**: coupling relation (not a standalone pin device)
- **Primary parameter**: coupling coefficient `k` (0..1)
- **Example**: `K1 Lp Ls 0.99`
- **CAD handling**: store as metadata relation between inductor instances.

---

## 3) Independent sources

## Voltage source (`V`)
- **Nature**: independent excitation
- **Parameter families**:
  1. **DC**: constant value
  2. **AC small-signal**: magnitude + optional phase
  3. **Transient waveform**
- **Common examples**:
  - **DC**: `V1 n+ n- DC 12V`
  - **SIN**: `SIN(V0 VA FREQ TD THETA PHASE)`
  - **PULSE**: `PULSE(V1 V2 TD TR TF PW PER)`
  - **EXP**: `EXP(V1 V2 TD1 TAU1 TD2 TAU2)`
  - **PWL**: explicit time/value pairs or file-based form
  - **SFFM**: `SFFM(V0 VA FC MDI FS)`
- **ngspice-specific extras**: AM, transient noise/random source forms, external input forms
- **CAD fields**:
  - mode selector: `DC | AC | SIN | PULSE | EXP | PWL | SFFM | ...`
  - mode-specific parameter group

## Current source (`I`)
- Same waveform families as voltage source, but values are current.
- Example: `I1 n+ n- DC 5mA`, `I2 n+ n- SIN(...)`

## Port source/device (`P` in Xyce)
- **Nature**: source + port metadata for RF/network analyses
- **Primary params**: DC/AC/transient + `port=<n>` + optional `Z0`
- **Example**: `P1 n+ n- DC 0 port=1 Z0=50 AC 1`

---

## 4) Controlled and behavioral sources

## Linear controlled sources (`E`, `F`, `G`, `H`)
- `E` VCVS: gain from control voltage pair
- `G` VCCS: transconductance from control voltage pair
- `F` CCCS: gain from current through named V-source
- `H` CCVS: transresistance from current through named V-source

**CAD fields**:
- output terminals
- control terminals (or control-reference name for `F/H`)
- gain/transconductance/transresistance

## Behavioral source (`B`)
- **Nature**: equation-defined source
- **Primary param**: expression for `V=` or `I=`
- **Example**: `B1 n+ n- V={sin(2*pi*1k*time)}`
- **CAD fields**:
  - source type `behavioral-voltage` or `behavioral-current`
  - expression editor with function support

---

## 5) Switches

## Voltage/current controlled switch (`S`, `W`)
- **Nature**: piecewise on/off resistance element
- **Primary params**:
  - model name
  - model includes `RON`, `ROFF`, threshold (`VT`/`IT`), hysteresis (`VH`/`IH`)
- **Examples**:
  - `S1 n+ n- nc+ nc- swmod`
  - `W1 n+ n- VCTRL cswmod`

## Generic expression-controlled switch (Xyce)
- **Form**: `S... model CONTROL={expr}`
- **CAD fields**: expression-based control entry.

---

## 6) Semiconductor compact devices

## Diode (`D`)
- **Nature**: 2-terminal nonlinear semiconductor
- **Primary params**:
  - instance: anode/cathode + model
  - optional area/perimeter/temp/IC
  - model picks level/family and physics parameters
- **Example**: `D1 a k DMOD area=2`

## BJT (`Q`)
- **Nature**: 3/4-terminal transistor
- **Primary params**:
  - terminals `C B E [S]`
  - model with family/level (e.g. GP/VBIC/HICUM/MEXTRAM in Xyce)
- **Example**: `Q1 c b e qmod area=1`

## JFET (`J`), MESFET (`Z`), MOSFET (`M`)
- **Nature**: FET families
- **Primary params**:
  - instance geometry (`L`, `W`, areas/perimeters for MOS)
  - model with **level** selecting compact model family (BSIM, PSP, CMG, EKV, etc.)
- **Example**: `M1 d g s b mosmod L=1u W=10u`

## Memristor
- ngspice: XSPICE `memristor` model (A-device)
- Xyce: `YMEMRISTOR`
- **Primary params**: low/high resistance bounds, initial state, threshold/evolution coefficients (model dependent)

---

## 7) Transmission/distributed elements

## Lossless/lossy 2-port lines (`T`, `O`)
- **Nature**: distributed propagation
- **Primary params**:
  - delay/characteristic impedance for ideal lossless
  - RLGC-per-length + line length for lossy model

## Lumped/coupled lines (`Y` in ngspice TXL, `P` in ngspice CPL, Xyce lumped line forms)
- **Nature**: multiconductor/discretized line models
- **Primary params**:
  - RLGC matrices or per-length terms
  - length and optional discretization settings

## URC (`U` in ngspice)
- **Nature**: uniformly distributed RC approximation
- **Primary params**: model + length + optional lumps

---

## 8) Digital behavioral devices

## ngspice
- XSPICE digital models use `A...` with `.model d_* ...`
- Examples: `d_and`, `d_ff`, `d_ram`, `d_lut`, `d_source`, `d_process`, `d_cosim`

## Xyce (preferred)
- `U<name> <type>(N) DPWR DGND in... out... model`
- Model type `.MODEL <name> DIG (...)`
- Device type defines pin contract:
  - fixed-input (`INV`, `BUF`, `XOR`, `DFF`, `JKFF`, etc.)
  - variable-input (`AND/NAND/OR/NOR` with `(N)`)

## Xyce legacy
- `Y<type>` digital devices remain for compatibility but are deprecated.

**CAD fields**:
- digital family/type selector
- vector pin counts where variable
- supply/reference nodes for digital IO thresholds and drive behavior
- delay and IO/load model parameters

---

## 9) Hierarchical/model-driven elements

## Subcircuit (`X`)
- **Nature**: reusable hierarchical block
- **Primary params**: ordered pin map + subckt name + optional params
- **Example**: `XU1 in out vdd gnd opamp PARAMS:gain=1e5`

## XSPICE generic model instance (`A`) / OSDI (`N` in ngspice docs)
- **Nature**: model-defined pinout
- **Primary params**: model reference + model-specific params
- **CAD rule**: generate symbol from model port metadata, not fixed template.

---

## 10) TCAD/PDE numerical devices

## Xyce `YPDE`
- `.MODEL <name> ZOD LEVEL=1|2`
- Most physical setup done at instance level (mesh, regions, electrodes, doping, materials, mobility/recombination flags)
- **Nature**: PDE device rather than compact model

## ngspice CIDER numerical forms
- `NUMD` (2-terminal), `NBJT` (3-terminal), `NUMOS` (4-terminal)
- **Nature**: numerical semiconductor simulation; geometry/process-oriented parameterization

---

## 11) UI/property-panel blueprint (recommended)

For every component, render fields in this order:

1. **Identity**: refdes, model name
2. **Pins**: fixed or generated pin map
3. **Nature mode**:
   - scalar (`R`,`C`,`L` value)
   - waveform (`V/I`: DC/AC/SIN/PULSE/EXP/PWL/SFFM...)
   - expression (`B`, generic switch control)
   - model level/family (`M`, `Q`, `D`, etc.)
   - relation (`K`, control source references)
4. **Advanced**: temperature, IC, noise, geometry, solver-specific options

This structure matches both ngspice and Xyce while keeping simulator-specific details pluggable.
