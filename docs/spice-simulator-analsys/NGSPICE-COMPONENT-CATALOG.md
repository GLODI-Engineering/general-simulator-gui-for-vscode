# ngspice Component Catalog for CAD Symbolization

Source: `working-tools/pdf-to-md/output/ngspice-46-manual.md` (ngspice manual v46 markdown)

Goal of this document: provide a CAD-oriented component inventory (ports, origin, class, pin semantics, and example netlist usage) from ngspice docs, including core SPICE devices, XSPICE elements, and CIDER numerical devices.

Detailed one-entry-per-XSPICE-model table is in:
`docs/spice-simulator-analsys/NGSPICE-XSPICE-MODEL-CATALOG.md`

Component value/waveform/model parameterization guide:
`docs/spice-simulator-analsys/COMPONENT-PARAMETERIZATION-BY-NATURE.md`

---

## Legend

- **Origin**
  - **ngspice** = native SPICE/ngspice device
  - **XSPICE** = code model / mixed-signal extension
  - **CIDER** = numerical device / TCAD-style device
  - **OSDI/OpenVAF** = external Verilog-A compact model interface in ngspice
- **Port count** means external schematic pins (not model parameters)

---

## 1) Primary element designators (Table 2.2 + related chapters)

These are the first-letter element types used in netlists.

| Designator | Component | Origin | Class | Typical ports | Pin meaning for CAD | Example from docs |
|---|---|---|---|---:|---|---|
| `A` | XSPICE code model instance | XSPICE | Behavioral / mixed-signal block | Variable | Model-defined input ports first, then outputs | `a1 1 2 amp .model amp gain(gain=5.0)` |
| `B` | Behavioral source (ASRC) | ngspice | Behavioral source | 2 | `n+ n-` | `B1 0 1 I=cos(v(1))+sin(v(2))` |
| `C` | Capacitor (fixed/semiconductor/behavioral) | ngspice | Passive | 2 | `n+ n-` | `CBYP 13 0 1UF` |
| `D` | Diode | ngspice | Semiconductor | 2 | `anode cathode` | `DBRIDGE 2 10 DIODE1` |
| `E` | VCVS (linear/nonlinear/table/poly/...) | ngspice | Controlled source | 4 (linear), 2 (expression form) | Output pair + control pair | `E1 2 3 14 1 2.0` |
| `F` | CCCS | ngspice | Controlled source | 2 (+control via V-source name) | Output pair; control current through `VNAM` | `F1 13 5 VSENS 5 m=2` |
| `G` | VCCS (linear/nonlinear) | ngspice | Controlled source | 4 (linear), 2 (expression form) | Output pair + control pair | `G51 55 225 cur='V(3)*V(3)-Offs'` |
| `H` | CCVS | ngspice | Controlled source | 2 (+control via V-source name) | Output pair; control current through `VNAM` | `H... N+ N- VNAM VALUE` |
| `I` | Independent current source | ngspice | Source | 2 | `n+ n-` | `ISRC 23 21 AC 0.333 45.0 ...` |
| `J` | JFET | ngspice | Semiconductor transistor | 3 | `drain gate source` | `J1 7 2 3 JM1 OFF` |
| `K` | Mutual inductor coupling | ngspice | Magnetic coupling annotation | N/A (coupling between `L` parts) | References inductor names, not electrical pins | `K43 LAA LBB 0.999` |
| `L` | Inductor (fixed/behavioral) | ngspice | Passive | 2 | `n+ n-` | `LSHUNT 23 51 10U IC=15.7MA` |
| `M` | MOSFET | ngspice | Semiconductor transistor | 4 | `drain gate source bulk` | `M31 2 17 6 10 MOSN L=5U W=2U` |
| `N` | Verilog-A compact device instance | OSDI/OpenVAF via ngspice | External compact model | Model-defined | Model-specific terminals (often 2/3/4+) | (see Ch.9 OSDI/OpenVAF workflow) |
| `O` | Lossy transmission line (LTRA) | ngspice | Transmission line | 4 | Port1 pair + Port2 pair | `O23 1 0 2 0 LOSSYMOD` |
| `P` | Coupled multiconductor line (CPL) | ngspice | Transmission line | `2N+2` | `NI1..NIX GND1 NO1..NOX GND2` | `P1 in1 in2 0 b1 b2 0 PLINE ...` |
| `Q` | BJT (GP/VBIC/HICUM...) | ngspice | Semiconductor transistor | 3/4/5 | `C B E` (+optional `S`, temp node) | `Q23 10 24 13 QMOD IC=0.6,5.0` |
| `R` | Resistor (fixed/semiconductor/behavioral) | ngspice | Passive | 2 | `n+ n-` | `R1 1 2 100` |
| `S` | Voltage-controlled switch (`SW`) | ngspice | Idealized switch | 4 | Path `N+ N-`, control `NC+ NC-` | `s1 1 2 3 4 switch1 ON` |
| `T` | Lossless transmission line (`TRA`) | ngspice | Transmission line | 4 | Port1 pair + Port2 pair | `T1 1 0 2 0 Z0=50 TD=10NS` |
| `U` | Uniform distributed RC line (`URC`) | ngspice | Distributed passive | 3 | `n1 n2 n3` (`n3` is capacitor reference node) | `U1 1 2 0 URCMOD L=50U` |
| `U` | Basic digital primitive (inside subckt, PSPICE mode) | XSPICE digital compatibility | Digital primitive | Variable | `power ground + logic pins + model refs` | `U2 AND(2) ...` |
| `V` | Independent voltage source | ngspice | Source | 2 | `n+ n-` | `VCC 10 0 DC 6` |
| `W` | Current-controlled switch (`CSW`) | ngspice | Idealized switch | 2 (+control via V-source name) | Path `N+ N-`, control current via `VNAM` | `w1 1 2 vclock switchmod1` |
| `X` | Subcircuit instance | ngspice | Hierarchical block | Variable | Subckt-defined pin list | `X... subcktName` |
| `Y` | Single lossy transmission line (`TXL`) | ngspice | Transmission line | 2 signal pins (single-ended ports) | `N1` and `N2`, each referenced to ground in syntax | `Y1 1 0 2 0 ymod LEN=2` |
| `Z` | MESFET | ngspice | Semiconductor transistor | 3 | `drain gate source` | `Z1 7 2 3 ZM1 OFF` |

---

## 2) CAD drawing guidance by class

### A. 2-pin passives/sources
- `R C L D V I B` all map cleanly to 2-pin symbols.
- Add orientation arrows/polarity where meaningful:
  - Current source arrow from `n+` to `n-` sign convention
  - Voltage source `+/-` markers
  - Diode anode/cathode marker

### B. Controlled sources and switches
- `E G` are commonly drawn as diamonds with explicit control pair pins.
- `F H W` use control by **named voltage source current** (not extra physical control pins). In CAD, either:
  1) expose a textual control reference field, or
  2) provide optional hidden control-link metadata.
- `S` has real control pins; draw as 4-pin switch.

### C. Transistors
- `J Z` are 3-pin FET-style symbols.
- `M` is 4-pin MOS (`D G S B`).
- `Q` should support optional substrate and optional thermal node in advanced models (VBIC/HICUM).

### D. Transmission/distributed elements
- `T O` as 4-pin two-port blocks.
- `Y` can be drawn as a 2-port single-ended line block.
- `P` needs scalable bus-like pin groups for coupled lines.
- `U` (URC) is 3-pin distributed RC block.

### E. Structural/model-driven
- `A`, `N`, `X`, digital `U*`: symbol should be generated from model/subckt pin metadata rather than a fixed primitive template.

---

## 3) XSPICE code-model families to classify in CAD libraries

Chapter 8 provides many `A`-device models. For CAD, classify by behavior and use auto-generated symbols from port tables.

### 3.1 Analog code models (XSPICE, Ch. 8.2)
Representative models listed in docs:
- `gain`, `summer`, `mult`, `divide`, `limit`
- `pwl`, `pwlts`, `filesource`, `multi_input_pwl`
- `aswitch`, `pswitch`
- `zener`, `ilimit`, `hyst`, `d_dt`, `int`
- `s_xfer`, `xfer`
- `slew`, `ind_coupling`, `core`
- oscillators: `sine`, `triangle`, `square`, `oneshot`
- measurement/utility: `cmeter`, `lmeter`, `memristor`
- lookup-table blocks: `table2d`, `table3d`
- others: `simple_diode`, `analog_delay`, `potentiometer`, delayed-state block

Typical examples in docs use:
- `a1 1 2 amp .model amp gain(...)`
- `a2 [1 2] 3 sum1 .model sum1 summer(...)`

### 3.2 Hybrid A/D bridge models (XSPICE, Ch. 8.3)
- Digital↔Analog and Real↔Analog bridges
- PWM / digital oscillator helper models
- `d_process`, `d_cosim` integration-related blocks

### 3.3 Digital code models (XSPICE, Ch. 8.4)
- Logic gates: buffer/inverter/and/nand/or/nor/xor/xnor/tristate/pullup/pulldown
- Sequential: D/JK/T/SR FFs, latches
- Memory/logic: state machine, divider, RAM, LUT, general LUT
- Sources/process co-sim: `d_source`, `d_process`, `d_cosim`

### 3.4 XSPICE transmission-line models (Ch. 8.5)
- Generic transmission line, coupled lines, microstrip/coupled microstrip/open-end models

**CAD recommendation:** For all `A` devices, drive symbol generation from the model's declared port list, with pin role metadata (input/output/bidirectional, analog/digital/real).

---

## 4) CIDER numerical devices/components (Part III)

These are physical-device numerical elements (TCAD-style), not just compact models.

| Element/model | Origin | Class | Ports | Pin order | Example from docs |
|---|---|---|---:|---|---|
| `NUMD` with `D...` element | CIDER | Numerical 2-terminal device (diode/resistor/moscap forms) | 2 | `n1 n2` | `DSWITCH 1 2 M_SWITCH_DIODE AREA=2` + `.MODEL ... NUMD` |
| `NBJT` with `Q...` element | CIDER | Numerical 3-terminal device (BJT / JFET / MESFET in level-2 context) | 3 | BJT: `C B E`; JFET/MESFET: `D G S` | `Q2 1 2 3 M_BJT AREA=4` |
| `NUMOS` with `M...` element | CIDER | Numerical 4-terminal device (MOSFET + other 4T structures) | 4 | MOS: `D G S B` | `M1 1 2 3 4 M_NMOS_1UM W=5um L=1um ...` |

Supporting CIDER geometry/material cards used to build device structure before simulation:
- `X.MESH`, `Y.MESH` (mesh definition)
- `DOMAIN/REGION`, `DOPING`, `MATERIAL`, `CONTACT/ELECTRODE`, `BOUNDARY/INTERFACE`, etc.

These are process/mesh descriptors, not schematic symbols in the usual SPICE sense.

---

## 5) Semiconductor model classification (for parameter-library tagging)

Useful for CAD model taxonomy (symbol is often same, model differs):

- **Diode (`D`)**: classic SPICE diode + level extensions + OSDI models (e.g., JUNCAP2, DIODE_CMC)
- **BJT (`Q`)**:
  - Level 1 Gummel-Poon / Ebers-Moll family
  - Level 4 VBIC
  - Level 8 HICUM/L2
  - OSDI: HICUM L0/L2, MEXTRAM
- **JFET (`J`)**: Level 1 and Level 2 Parker-Skellern
- **MESFET (`Z`)**: Level 1 Statz, additional levels (incl. hfet1/hfet2)
- **MOS (`M`)**:
  - MOS1/2/3/6/9
  - BSIM1/2/3/4 (various level mappings)
  - BSIMSOI, SOI3, HiSIM2/HiSIM_HV
  - OSDI/OpenVAF pathway for many modern Verilog-A compact models

---

## 6) Suggested CAD data schema (what to store per symbol)

For robust import/export and later drawing automation, store per component:

1. **Designator** (`R`, `M`, `A`, ...)
2. **Display name**
3. **Origin** (`ngspice` / `XSPICE` / `CIDER` / `OSDI`)
4. **Class** (passive/source/transistor/switch/transmission/behavioral/hierarchical)
5. **Pin list** (ordered pin names, direction where known)
6. **Variable-port rules** (for `A`, `X`, `U*`, `P`)
7. **Netlist template** (instance line skeleton)
8. **Model requirements** (`.model` mandatory or not)
9. **Typical example** (one legal instance)
10. **Rendering hints** (diamond source, transistor body pin visibility, bus pins for multiconductor lines)

---

## 7) Extra additions / caveats

1. **Disambiguate `U`**: it can mean URC or digital primitive, depending on compatibility mode and context (inside subckt + known digital basic type).
2. **Some components are references, not pins**: `K` coupling and `F/H/W` control via named source current need metadata links in CAD.
3. **Model-level does not change symbol topology in most cases**: especially for `M`, `Q`, `D`; keep symbol stable, switch models by parameter set.
4. **A-device symbols should be generated from model port declarations** instead of hardcoded symbol libraries.
5. **CIDER deck cards are process/device-definition entities**, usually represented in a device editor rather than schematic symbol palettes.

---

## 8) Quick netlist skeletons (for implementation)

```spice
* Core
Rname n+ n- value
Cname n+ n- value
Lname n+ n- value
Dname anode cathode model
Qname C B E [S] [T] model
Mname D G S B model
Jname D G S model
Zname D G S model

* Sources / controlled sources
Vname n+ n- <dc/ac/transient>
Iname n+ n- <dc/ac/transient>
Ename n+ n- nc+ nc- gain
Gname n+ n- nc+ nc- transconductance
Fname n+ n- Vctrl gain
Hname n+ n- Vctrl transresistance
Bname n+ n- V=<expr> | I=<expr>

* Switches / lines
Sname n+ n- nc+ nc- model
Wname n+ n- Vctrl model
Tname n1 n2 n3 n4 Z0=... TD=...
Oname n1 n2 n3 n4 model
Yname n1 0 n2 0 model
Pname ni... gnd1 no... gnd2 model
Uname n1 n2 n3 model   ; URC

* Structural / model-driven
Aname <ports...> model
Xname <ports...> subckt
Nname <ports...> model ; OpenVAF/OSDI compact model
```
