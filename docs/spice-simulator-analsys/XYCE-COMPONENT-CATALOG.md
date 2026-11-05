# Xyce Component Catalog for CAD Symbolization

Source: `working-tools/pdf-to-md/output/Xyce_RG.md` (Xyce Reference Guide 7.10)

Goal: CAD-oriented component inventory for Xyce devices (ports, origin/classification, typical syntax, and model-family notes), analogous to the ngspice catalog.

Component value/waveform/model parameterization guide:
`docs/spice-simulator-analsys/COMPONENT-PARAMETERIZATION-BY-NATURE.md`

---

## 1) Primary device designators (from Table 2-35, section 2.3)

| Designator | Component | Class | Typical ports | Pin meaning / CAD notes | Typical syntax snippet |
|---|---|---|---:|---|---|
| `B` | Nonlinear dependent source | Behavioral source | 2 | `+ -`; expression-driven V or I | `B<name> + - V={expr}` |
| `C` | Capacitor | Passive | 2 | `+ -` | `C<name> + - [model] value` |
| `D` | Diode | Semiconductor | 2 | `anode cathode` | `D<name> a c model [area]` |
| `E` | VCVS | Controlled source | 4 | output pair + control pair | `E<name> + - +c -c gain` |
| `F` | CCCS | Controlled source | 2 (+control ref) | output pair; control by V-source name | `F<name> + - Vctrl gain` |
| `G` | VCCS | Controlled source | 4 | output pair + control pair | `G<name> + - +c -c gm` |
| `H` | CCVS | Controlled source | 2 (+control ref) | output pair; control by V-source name | `H<name> + - Vctrl gain` |
| `I` | Independent current source | Source | 2 | `+ -` | `I<name> + - [DC/AC/transient]` |
| `J` | JFET | Transistor | 3 | `D G S` | `J<name> d g s model` |
| `K` | Mutual inductor | Coupling annotation | 0 electrical pins | references `L` instance names | `K<name> L1 [L2..] k|model` |
| `L` | Inductor | Passive | 2 | `+ -` | `L<name> + - [model] value` |
| `M` | MOSFET | Transistor | 4+ | `D G S B` (+optional SOI nodes) | `M<name> d g s b [soi...] model` |
| `O` | Lossy transmission line (LTRA) | Transmission line | 4 | A-port pair + B-port pair | `O<name> A+ A- B+ B- model` |
| `P` | Port device | Source/port | 2 | terminal pair + port metadata | `P<name> + - port=<n> ...` |
| `Q` | BJT | Transistor | 3/4 | `C B E [substrate]` | `Q<name> c b e [s] model` |
| `R` | Resistor | Passive | 2 | `+ -` | `R<name> + - [model] value` |
| `S` | Voltage-controlled switch | Switch | 4 | path pair + control pair | `S<name> path+ path- ctrl+ ctrl- model` |
| `S` | Generic switch (expr-controlled) | Switch | 2 (+expr control) | path pair; control in `CONTROL={...}` | `S<name> + - model CONTROL={expr}` |
| `T` | Lossless transmission line | Transmission line | 4 | A-port pair + B-port pair | `T<name> A+ A- B+ B- ...` |
| `U` | Behavioral digital device (preferred) | Digital behavioral | variable | digital power/ground + in/out pins | `U<name> TYPE(N) DPWR DGND in.. out.. model` |
| `V` | Independent voltage source | Source | 2 | `+ -` | `V<name> + - [DC/AC/transient]` |
| `W` | Current-controlled switch | Switch | 2 (+control ref) | path pair; control by V-source name | `W<name> + - Vctrl model` |
| `X` | Subcircuit instance | Hierarchical | variable | subckt-defined pins | `X<name> nodes... subckt` |
| `Y<type>` | Y-type digital device (deprecated) | Digital behavioral (legacy) | variable | legacy digital style | `Y<type> <name> ... model` |
| `YPDE` | PDE/TCAD device | Numerical TCAD | 2..4 | terminal count depends on 1D/2D setup | `YPDE <name> nodes... model` |
| `YACC` | Accelerated mass | Multiphysics/mechanical | 3 state nodes | acceleration/velocity/position nodes | `YACC <name> a v x ...` |
| `YLIN` | Linear device | Linear macro-element | 2 | model-defined linear behavior | `YLIN <name> + - model` |
| `YMEMRISTOR` | Memristor device | Nonlinear memory element | 2 | `+ -` | `YMEMRISTOR <name> + - model` |
| `Z` | MESFET | Transistor | 3 | `D G S` | `Z<name> d g s model` |

---

## 2) High-value model-family classification for CAD/model library

### 2.1 BJT families in Xyce
- Level 1 (SPICE-like)
- Level 11/12 (VBIC 1.3)
- Level 23 (FBH HBT_X)
- Level 230 (HICUM/L0)
- Level 234 (HICUM/L2)
- Level 504/505 (MEXTRAM)

### 2.2 MOSFET families in Xyce
- Levels 1/2/3/6 (classic SPICE)
- Level 9 (BSIM3)
- Level 10 (BSIM-SOI)
- Levels 14/54 (BSIM4)
- Level 18 (VDMOS)
- Levels 70 / 70450 (BSIM-SOI variants)
- Level 77 (BSIM6)
- Level 102 (Legacy PSP 102.5)
- Levels 103 / 1031 (PSP 103.4)
- Levels 107 / 108 / 110 / 111 (BSIM-CMG variants)
- Levels 2000 / 2001 (MVS)
- Level 2002 (MVSG_CMC)
- Levels 260 / 301 (EKV)
- Level 10240 (L_UTSOI)

### 2.3 Digital behavioral device families
Preferred U-type devices (section 2.3.28):
- `INV`, `BUF`, `AND`, `NAND`, `OR`, `NOR`, `XOR`, `NXOR`, `DFF`, `JKFF`, `TFF`, `DLTCH`, `ADD`
- Variable-input devices: `AND/NAND/OR/NOR` with `(N)` syntax
- Fixed-input devices: others (notably FF/latch/adders with predefined pin contracts)

Legacy Y-type devices are deprecated but still documented for compatibility (section 2.3.29).

### 2.4 TCAD/PDE devices
- `YPDE` with `.MODEL <name> ZOD LEVEL=1|2`
- Level 1: 1D PDE device
- Level 2: 2D PDE device
- Most PDE behavior configured via instance-level composite parameters (`NODE`, `REGION`, `DOPINGPROFILES`, etc.)

---

## 3) CAD symbolization guidance

1. **Separate symbol families**
   - analog primitives/sources
   - semiconductor transistors
   - transmission/port/network elements
   - digital behavioral (`U` preferred, `Y` legacy)
   - TCAD/PDE (`YPDE`) and multiphysics (`YACC`)

2. **Reference-driven elements**
   - `K`, `F`, `H`, `W` require metadata links to controlling elements, not only pins.

3. **Variable-pin devices**
   - `U`, `X`, `YPDE`, `P`, some `S` variants should use parameterized symbol generators.

4. **Model-level versus symbol topology**
   - For `M`, `Q`, `D`, symbol is mostly stable while `.MODEL LEVEL` selects physics.

5. **Deprecation handling**
   - Keep `Y<type>` in import pipeline as compatibility path; map to `U` where possible.

---

## 4) Extra notes useful for implementation

- Xyce requires at least two nodes on each device instance line.
- Node `0` is global ground; `$G...` prefix denotes global nodes.
- Fully resolved subcircuit-internal node naming uses `X1:X2:node` path syntax.

These are useful for robust netlist round-trip and hierarchical probing in CAD tooling.
