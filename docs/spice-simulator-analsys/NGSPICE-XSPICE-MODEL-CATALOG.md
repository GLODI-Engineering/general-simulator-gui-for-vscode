# ngspice XSPICE Model Catalog (one-entry-per-model)

Source: `working-tools/pdf-to-md/output/ngspice-46-manual.md` (Chapter 8).

Purpose: CAD/symbol planning for **every documented predefined XSPICE model** (8.2, 8.3, 8.4, 8.5), with model keyword, pin topology, class, and a short example reference.

> Notes
> - Port topology is taken from each model's `PORT_TABLE` (or section description/examples where formatting is degraded).
> - Digital models are event-driven and usually use model names like `d_*`.
> - For CAD, many of these are best as **parameterized symbol generators** (variable input vectors).

---

## A) Analog XSPICE models (8.2.x)

| Section | Spice model keyword | Model name in manual | Ports for CAD | Category | Example from manual (short) |
|---|---|---|---|---|---|
| 8.2.1 | `gain` | Gain | `in`, `out` (2) | analog math block | `a1 1 2 amp .model amp gain(...)` |
| 8.2.2 | `summer` | Summer | `in[]`, `out` (N+1) | analog math block | `a2 [1 2] 3 sum1 .model sum1 summer(...)` |
| 8.2.3 | `mult` | Multiplier | `in[]`, `out` (N+1) | analog math block | `a3 [1 2 3] 4 sigmult .model sigmult mult(...)` |
| 8.2.4 | `divide` | Divider | `num`, `den`, `out` (3) | analog math block | section example in 8.2.4 |
| 8.2.5 | `limit` | Limiter | `in`, `out` (2) | limiter/nonlinearity | `a5 1 2 limit5 .model limit5 limit(...)` |
| 8.2.6 | `climit` | Controlled Limiter | `in`, `cntl_upper`, `cntl_lower`, `out` (4) | controlled limiter | `a6 3 6 8 4 varlimit .model varlimit climit(...)` |
| 8.2.7 | `pwl` | PWLControlled Source | `in`, `out` (2) | transfer function | `... .model ... pwl(x_array=... y_array=...)` |
| 8.2.8 | `pwlts` | PWLTime Controlled Source | `out` (1, time-driven) | waveform source | section example in 8.2.8 |
| 8.2.9 | `filesource` | Filesource (PWL from file) | `out` (1) | file-driven source | section example in 8.2.9 |
| 8.2.10 | `multi_input_pwl` | Multi_input_PWL_block | `in[]`, `out` | multi-input transfer | `a82 [..] .. pwlm .model pwlm multi_input_pwl(...)` |
| 8.2.11 | `aswitch` | Analog Switch | control + path ports | analog switch | `... .model switch3 aswitch(...)` |
| 8.2.12 | `pswitch` | Alternative Analog Switch | control + path ports | analog switch | `... .model switch4 pswitch(...)` |
| 8.2.13 | `zener` | Zener Diode | 2 pins | nonlinear 2T element | `... .model vref10 zener(...)` |
| 8.2.14 | `ilimit` | Current Limiter | multi-port limiter | current-limited driver block | `... .model amp3 ilimit(...)` |
| 8.2.15 | `hyst` | Hysteresis Block | `in`, `out` | hysteresis nonlinearity | section example in 8.2.15 |
| 8.2.16 | `d_dt` | Differentiator | `in`, `out` | dynamic operator | `... .model slope_gen d_dt(...)` |
| 8.2.17 | `int` | Integrator | `in`, `out` | dynamic operator | section example in 8.2.17 |
| 8.2.18 | `s_xfer` | S-Domain Transfer Function | `in`, `out` | Laplace transfer | `... .model cheby1 s_xfer(...)` |
| 8.2.19 | `xfer` | PWLTransfer Function | `in`, `out` | frequency-domain transfer | section example in 8.2.19 |
| 8.2.20 | `slew` | Slew Rate Block | `in`, `out` | slew limiting | section example in 8.2.20 |
| 8.2.21 | `lcouple` | Inductive Coupling | `l`, `mmf_out` (2 coupled magnetic ports) | magnetic building block | `a150 (7 0) (9 10) lcouple1 ...` |
| 8.2.22 | `core` | Magnetic Core | `mc` (single magnetic port) | magnetic core model | `... .model iron_core core(...)` |
| 8.2.23 | `sine` | Controlled Sine Oscillator | `cntl_in`, `out` | oscillator/VCO-like | `asine 1 2 in_sine .model in_sine sine(...)` |
| 8.2.24 | `triangle` | Controlled Triangle Oscillator | `cntl_in`, `out` | oscillator | `ain 1 2 ramp1 .model ramp1 triangle(...)` |
| 8.2.25 | `square` | Controlled Square Oscillator | `cntl_in`, `out` | oscillator/clock-like | section example in 8.2.25 |
| 8.2.26 | `oneshot` | Controlled One-Shot | `cntl_in`, `out` | pulse generator | section example in 8.2.26 |
| 8.2.27 | `cmeter` | Capacitance Meter | `in`, `out` (2) | measurement/sensing block | `atest1 1 2 ctest .model ctest cmeter(...)` |
| 8.2.28 | `lmeter` | Inductance Meter | `in`, `out` (2) | measurement/sensing block | `... .model ... lmeter(...)` |
| 8.2.29 | `memristor` | Memristor | 2 pins | nonlinear memory resistor | `amen 1 2 memr .model memr memristor(...)` |
| 8.2.30 | `table2d` | 2D table model | `inx`, `iny`, `out` (3) | table-based nonlinear block | `atab inx iny %id(out1 out2) tabmod .model tabmod table2d(...)` |
| 8.2.31 | `table3d` | 3D table model | `inx`, `iny`, `inz`, `out` (4) | table-based nonlinear block | section example in 8.2.31 |
| 8.2.32 | `sidiode` | Simple Diode Model | 2 pins (`a`,`k`) | simplified diode | `a1 a k ds1 .model ds1 sidiode(...)` |
| 8.2.33 | `delay` | Analog delay | `in`, `out` | analog delay line | section example in 8.2.33 |
| 8.2.34 | `potentiometer` | Potentiometer | 3 terminals (+ optional control) | variable resistor element | section example in 8.2.34 |
| 8.2.35 | `astate` | Delayed state of a node | `in`, `out` | state memory/delay | `astate1 in out newstate .model newstate astate(...)` |

---

## B) Hybrid A/D and Real bridges (8.3.x)

| Section | Spice model keyword | Model name in manual | Ports for CAD | Category | Example from manual (short) |
|---|---|---|---|---|---|
| 8.3.1 | `dac_bridge` | Digital-to-Analog Node Bridge | `in[d]`, `out[analog]` (vectors allowed) | bridge D→A | `abridge1 [7] [2] dac1 .model dac1 dac_bridge(...)` |
| 8.3.2 | `adc_bridge` | Analog-to-Digital Node Bridge | `in[analog]`, `out[d]` (vectors allowed) | bridge A→D | `abridge2 [1] [8] adc_buff .model adc_buff adc_bridge(...)` |
| 8.3.3 | `bidi_bridge` | Bidirectional Analog/Digital Node Bridge | `a[]`, `d[]`, optional `dir[]` | bidirectional bridge | `... .model bidi_buff bidi_bridge(...)` |
| 8.3.4 | `d_osc` | Controlled Digital Oscillator | `cntl_in`, `out[d]` | digitally output VCO | `a5 1 8 var_clock .model var_clock d_osc(...)` |
| 8.3.5 | `d_to_real` | Node bridge from digital to real (enable) | `in[d]`, `enable[d]`, `out[real]` | bridge D→real | section example in 8.3.5 |
| 8.3.6 | `real_delay` | Z^-1 block on real data | `in[real]`, `clk[d]`, `out[real]` | sampled delay | section example in 8.3.6 |
| 8.3.7 | `real_gain` | Gain block for event-driven real data | `in[real]`, `out[real]` | real-domain gain | examples in 8.3.7 and mixed-IO example |
| 8.3.8 | `real_to_v` | Node bridge from real to analog voltage | `in[real]`, `out[v]` | bridge real→analog | mixed-IO example uses `real_to_v` |
| 8.3.9 | `d_pwm` | Controlled PWM Oscillator | `cntl_in`, `out[d]` | PWM generator | `a5 cin dout pwm_osc .model pwm_osc d_pwm(...)` |

---

## C) Digital XSPICE models (8.4.x)

| Section | Spice model keyword | Model name in manual | Ports for CAD | Category | Example from manual (short) |
|---|---|---|---|---|---|
| 8.4.1 | `d_buffer` | Buffer | `in`, `out` | logic gate | in section 8.4.1 |
| 8.4.2 | `d_inverter` | Inverter | `in`, `out` | logic gate | in section 8.4.2 |
| 8.4.3 | `d_and` | And | `in[]`, `out` | logic gate (N-input) | in section 8.4.3 |
| 8.4.4 | `d_nand` | Nand | `in[]`, `out` | logic gate (N-input) | in section 8.4.4 |
| 8.4.5 | `d_or` | Or | `in[]`, `out` | logic gate (N-input) | in section 8.4.5 |
| 8.4.6 | `d_nor` | Nor | `in[]`, `out` | logic gate (N-input) | in section 8.4.6 |
| 8.4.7 | `d_xor` | Xor | `in[]`, `out` | logic gate | appears in examples (`d_xor`) |
| 8.4.8 | `d_xnor` | Xnor | `in[]`, `out` | logic gate | in section 8.4.8 |
| 8.4.9 | `d_tristate` | Tristate | `in`, `enable`, `out` | tri-state buffer | `... .model tri7 d_tristate(...)` |
| 8.4.10 | `d_pullup` | Pullup | `out` | digital pull resistor | `a2 9 pullup1 .model pullup1 d_pullup(...)` |
| 8.4.11 | `d_pulldown` | Pulldown | `out` | digital pull resistor | `a4 9 pulldown1 .model pulldown1 d_pulldown(...)` |
| 8.4.12 | `d_dff` | D Flip Flop | data/clock/set-reset + outputs (model-defined) | sequential logic | section 8.4.12 |
| 8.4.13 | `d_jkff` | JK Flip Flop | J,K,clock,+control,+Q/Qbar (model-defined) | sequential logic | section 8.4.13 |
| 8.4.14 | `d_tff` | Toggle Flip Flop | T,clock,+control,+Q/Qbar (model-defined) | sequential logic | `... .model flop3 d_tff(...)` |
| 8.4.15 | `d_srff` | Set-Reset Flip Flop | S,R,clock,+Q/Qbar (model-defined) | sequential logic | `... .model flop7 d_srff(...)` |
| 8.4.16 | `d_dlatch` | D Latch | D,enable,+Q/Qbar (model-defined) | sequential logic | section 8.4.16 |
| 8.4.17 | `d_srlatch` | Set-Reset Latch | S,R,+Q/Qbar (model-defined) | sequential logic | section 8.4.17 |
| 8.4.18 | `d_state` | State Machine | state-machine-defined vectors | FSM block | section 8.4.18 |
| 8.4.19 | `d_fdiv` | Frequency Divider | `freq_in`, `out` | digital clock divider | `a4 3 7 divider .model divider d_fdiv(...)` |
| 8.4.20 | `d_ram` | RAM | `data_in[]`, `data_out[]`, `address[]`, `write_en`, `select[]` | memory block | `... .model ram2 d_ram(...)` |
| 8.4.21 | `d_source` | Digital Source | `out[]` | file-driven digital stimulus | `a3 [..] input_vector .model input_vector d_source(...)` |
| 8.4.22 | `d_lut` | LUT | `in[]`, `out` | combinational LUT | `... .model ... d_lut(table_values="...")` |
| 8.4.23 | `d_genlut` | General LUT | `in[]`, `out[]` | M-output combinational LUT | `... .model ... d_genlut(table_values="...")` |
| 8.4.24 | `d_process` | D_process | `in[]`, `clk`, `reset`, `out[]` | external process co-sim (pipes) | `a1 [d1] clk1 reset1 [o1..o4] proc1 .model proc1 d_process(...)` |
| 8.4.25 | `d_cosim` | d_cosim | `d_in[]`, `d_out[]`, `d_inout[]` | shared-lib co-sim container | `adut [...] dut .model dut d_cosim simulation="./adc.so"` |

---

## D) XSPICE transmission-line models (8.5.x)

| Section | Spice model keyword | Model name in manual | Ports for CAD | Category | Example from manual (short) |
|---|---|---|---|---|---|
| 8.5.1 | `tline` | Generic transmission line | `in` pair, `out` pair | RF/transmission line | `A1 ... .MODEL TLIN1 TLINE(...)` |
| 8.5.2 | `cpline` | Generic coupled lines | multi-line coupled ports | RF/coupled lines | `A1 ... .MODEL CPLIN... CPLINE(...)` |
| 8.5.3 | `mlin` | Microstrip line | `in` pair, `out` pair | RF/microstrip | `A1 ... .MODEL MLIN1 MLIN(...)` |
| 8.5.4 | `cpmline` | Coupled microstrip | multi-conductor microstrip ports | RF/coupled microstrip | `A1 ... .MODEL ... CPMLIN(...)` |
| 8.5.5 | `msopen` | Microstrip open end | termination-style port(s) | RF discontinuity | `A1 %gd(1 0) MODEL_MS .MODEL MODEL_MS MSOPEN(...)` |

---

## E) CAD implementation recommendations (important)

1. **Do not hardcode A-device pin counts globally.**
   Use per-model pin templates (or auto-generation from model metadata).

2. **Use four distinct XSPICE symbol families:**
   - analog blocks (8.2)
   - bridges/real-domain (8.3)
   - digital primitives (8.4)
   - RF transmission blocks (8.5)

3. **For vector-port models** (`summer`, `mult`, logic gates, LUTs, RAM, `d_process`, `d_cosim`):
   provide bus-capable symbols with editable vector width.

4. **For magnetic models** (`lcouple`, `core`):
   keep dedicated symbols (magnetic-domain connectors are conceptually different from plain electrical pins).

5. **For co-sim models** (`d_process`, `d_cosim`):
   symbol should prominently expose model/file parameters (`process_file`, `simulation`, queue/delay settings).

6. **For reproducibility**, store section link metadata in your CAD library:
   e.g., `ngspice_manual_section: 8.4.20`.
