// Device-model parameter registry.
//
// Source of truth for every level is the simulator's reference manual:
//   ngspice 46 user manual (working-tools/pdf-to-md/output/ngspice-46-manual.md)
//   Xyce 7.10 reference guide (working-tools/pdf-to-md/output/Xyce_RG.md)
//
// Cross-reference summary: Misc/spice-simulator-analsys/SIMULATOR-COMPONENT-SUPPORT.md
//
// Notes on the data model:
// - `level` is the SPICE LEVEL keyword value for the model card. Use `0` for
//   devices where there is no level switch (the linear passives).
// - `raw: true` marks an advanced compact model whose parameter set is too
//   large or proprietary to enumerate here (BSIM3/4, BSIM-SOI, BSIM-CMG, PSP,
//   HiSIM, EKV3, MVS, HICUM, VBIC, MEXTRAM, ...). The panel falls back to a
//   single textarea where the user pastes a `.MODEL` card body verbatim.
// - Defaults match the manual exactly; `description` is paraphrased to fit.
// - `group` keys are uniform per device so the modal can group fields.

export interface ModelParam {
  name: string;
  label: string;
  unit?: string;
  defaultValue: number | string;
  description: string;
  group?: string;
}

export interface ModelLevel {
  level: number;
  name: string;
  simulator: "ngspice" | "xyce" | "both";
  params: ModelParam[];
  raw?: boolean;
}

export interface DeviceConfig {
  defaultLevel: number;
  levels: ModelLevel[];
}

// ── Helper to look up the device family by block type ───────────────────────
export function getDeviceFamily(blockType: string): string | null {
  if (/passive\.resistor(\.|$)/.test(blockType)) return "resistor";
  if (/passive\.capacitor(\.|$)/.test(blockType)) return "capacitor";
  if (/passive\.inductor(\.|$)/.test(blockType)) return "inductor";
  if (/passive\.switch/.test(blockType)) return "switch";
  if (/(^|\.)bjt(\.|_)/.test(blockType)) return "bjt";
  if (/mosfet/.test(blockType)) return "mosfet";
  if (/jfet/.test(blockType)) return "jfet";
  if (/mesfet/.test(blockType)) return "mesfet";
  if (/diode/.test(blockType)) return "diode";
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Passive: Resistor
// ngspice 27.2.1; Xyce 2.3.1
// ────────────────────────────────────────────────────────────────────────────

const RESISTOR_INSTANCE: ModelParam[] = [
  {
    name: "R",
    label: "Resistance",
    unit: "Ω",
    defaultValue: 1000,
    description: "Linear resistance value",
    group: "Value",
  },
  {
    name: "ac",
    label: "AC resistance",
    unit: "Ω",
    defaultValue: 0,
    description: "Resistance used during .AC analysis (defaults to R)",
    group: "Value",
  },
  {
    name: "temp",
    label: "Temperature",
    unit: "°C",
    defaultValue: 27,
    description: "Instance operating temperature",
    group: "Temperature",
  },
  {
    name: "dtemp",
    label: "ΔT",
    unit: "°C",
    defaultValue: 0,
    description: "Offset from circuit-wide temperature",
    group: "Temperature",
  },
  {
    name: "tc1",
    label: "TC1",
    unit: "1/°C",
    defaultValue: 0,
    description: "First-order temperature coefficient",
    group: "Temperature",
  },
  {
    name: "tc2",
    label: "TC2",
    unit: "1/°C²",
    defaultValue: 0,
    description: "Second-order temperature coefficient",
    group: "Temperature",
  },
  {
    name: "m",
    label: "Multiplier (M)",
    defaultValue: 1,
    description: "Parallel device multiplier",
    group: "Geometry",
  },
  {
    name: "scale",
    label: "Scale",
    defaultValue: 1,
    description: "Scale factor on resistance",
    group: "Geometry",
  },
  {
    name: "l",
    label: "Length",
    unit: "m",
    defaultValue: 0,
    description: "Resistor length (for sheet-resistance model)",
    group: "Geometry",
  },
  {
    name: "w",
    label: "Width",
    unit: "m",
    defaultValue: 0,
    description: "Resistor width (for sheet-resistance model)",
    group: "Geometry",
  },
  {
    name: "noisy",
    label: "Generate noise",
    defaultValue: 1,
    description: "1 = include thermal noise contribution",
    group: "Noise",
  },
];

const RESISTOR_MODEL: ModelParam[] = [
  {
    name: "rsh",
    label: "RSH",
    unit: "Ω/□",
    defaultValue: 0,
    description: "Sheet resistance",
    group: "Sheet model",
  },
  {
    name: "narrow",
    label: "Narrow",
    unit: "m",
    defaultValue: 0,
    description: "Width correction (etching)",
    group: "Sheet model",
  },
  {
    name: "short",
    label: "Short",
    unit: "m",
    defaultValue: 0,
    description: "Length correction",
    group: "Sheet model",
  },
  {
    name: "defw",
    label: "Default W",
    unit: "m",
    defaultValue: 1e-6,
    description: "Default device width if instance W omitted",
    group: "Sheet model",
  },
  {
    name: "tnom",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
  {
    name: "kf",
    label: "KF",
    defaultValue: 0,
    description: "Flicker noise coefficient",
    group: "Noise",
  },
  {
    name: "af",
    label: "AF",
    defaultValue: 1,
    description: "Flicker noise exponent",
    group: "Noise",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Passive: Capacitor
// ngspice 27.2.2; Xyce 2.3.6
// ────────────────────────────────────────────────────────────────────────────

const CAPACITOR_INSTANCE: ModelParam[] = [
  {
    name: "C",
    label: "Capacitance",
    unit: "F",
    defaultValue: 1e-6,
    description: "Linear capacitance value",
    group: "Value",
  },
  {
    name: "IC",
    label: "Initial voltage",
    unit: "V",
    defaultValue: 0,
    description: "Initial voltage across the capacitor (UIC)",
    group: "Initial conditions",
  },
  {
    name: "temp",
    label: "Temperature",
    unit: "°C",
    defaultValue: 27,
    description: "Instance operating temperature",
    group: "Temperature",
  },
  {
    name: "dtemp",
    label: "ΔT",
    unit: "°C",
    defaultValue: 0,
    description: "Offset from circuit-wide temperature",
    group: "Temperature",
  },
  {
    name: "m",
    label: "Multiplier (M)",
    defaultValue: 1,
    description: "Parallel device multiplier",
    group: "Geometry",
  },
  {
    name: "scale",
    label: "Scale",
    defaultValue: 1,
    description: "Scale factor on capacitance",
    group: "Geometry",
  },
  {
    name: "w",
    label: "Width",
    unit: "m",
    defaultValue: 0,
    description: "Device width (semiconductor capacitor model)",
    group: "Geometry",
  },
  {
    name: "l",
    label: "Length",
    unit: "m",
    defaultValue: 0,
    description: "Device length (semiconductor capacitor model)",
    group: "Geometry",
  },
];

const CAPACITOR_MODEL: ModelParam[] = [
  {
    name: "cj",
    label: "CJ",
    unit: "F/m²",
    defaultValue: 0,
    description: "Bottom-wall capacitance per area",
    group: "Geometry model",
  },
  {
    name: "cjsw",
    label: "CJSW",
    unit: "F/m",
    defaultValue: 0,
    description: "Sidewall capacitance per meter",
    group: "Geometry model",
  },
  {
    name: "defw",
    label: "Default W",
    unit: "m",
    defaultValue: 1e-6,
    description: "Default device width",
    group: "Geometry model",
  },
  {
    name: "defl",
    label: "Default L",
    unit: "m",
    defaultValue: 0,
    description: "Default device length",
    group: "Geometry model",
  },
  {
    name: "narrow",
    label: "Narrow",
    unit: "m",
    defaultValue: 0,
    description: "Width correction factor",
    group: "Geometry model",
  },
  {
    name: "short",
    label: "Short",
    unit: "m",
    defaultValue: 0,
    description: "Length correction factor",
    group: "Geometry model",
  },
  {
    name: "tc1",
    label: "TC1",
    unit: "1/°C",
    defaultValue: 0,
    description: "First-order temperature coefficient",
    group: "Temperature",
  },
  {
    name: "tc2",
    label: "TC2",
    unit: "1/°C²",
    defaultValue: 0,
    description: "Second-order temperature coefficient",
    group: "Temperature",
  },
  {
    name: "tnom",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
  {
    name: "di",
    label: "DI",
    defaultValue: 0,
    description: "Relative dielectric constant",
    group: "Physical",
  },
  {
    name: "thick",
    label: "THICK",
    unit: "m",
    defaultValue: 0,
    description: "Insulator thickness",
    group: "Physical",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Passive: Inductor
// ngspice 27.2.3; Xyce 2.3.8
// ────────────────────────────────────────────────────────────────────────────

const INDUCTOR_INSTANCE: ModelParam[] = [
  {
    name: "L",
    label: "Inductance",
    unit: "H",
    defaultValue: 1e-6,
    description: "Linear inductance value",
    group: "Value",
  },
  {
    name: "IC",
    label: "Initial current",
    unit: "A",
    defaultValue: 0,
    description: "Initial current through the inductor (UIC)",
    group: "Initial conditions",
  },
  {
    name: "temp",
    label: "Temperature",
    unit: "°C",
    defaultValue: 27,
    description: "Instance operating temperature",
    group: "Temperature",
  },
  {
    name: "dtemp",
    label: "ΔT",
    unit: "°C",
    defaultValue: 0,
    description: "Offset from circuit-wide temperature",
    group: "Temperature",
  },
  {
    name: "m",
    label: "Multiplier (M)",
    defaultValue: 1,
    description: "Parallel device multiplier",
    group: "Geometry",
  },
  {
    name: "scale",
    label: "Scale",
    defaultValue: 1,
    description: "Scale factor on inductance",
    group: "Geometry",
  },
  {
    name: "nt",
    label: "Number of turns",
    defaultValue: 1,
    description: "Number of turns (used by inductor model)",
    group: "Geometry",
  },
];

const INDUCTOR_MODEL: ModelParam[] = [
  {
    name: "tc1",
    label: "TC1",
    unit: "1/°C",
    defaultValue: 0,
    description: "First-order temperature coefficient",
    group: "Temperature",
  },
  {
    name: "tc2",
    label: "TC2",
    unit: "1/°C²",
    defaultValue: 0,
    description: "Second-order temperature coefficient",
    group: "Temperature",
  },
  {
    name: "tnom",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
  {
    name: "csect",
    label: "Cross section",
    unit: "m²",
    defaultValue: 0,
    description: "Core cross-sectional area",
    group: "Physical",
  },
  {
    name: "length",
    label: "Magnetic length",
    unit: "m",
    defaultValue: 0,
    description: "Mean magnetic path length",
    group: "Physical",
  },
  {
    name: "mu",
    label: "μr",
    defaultValue: 1,
    description: "Relative magnetic permeability of the core",
    group: "Physical",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Diode
// ngspice 7.2.1 (Junction DC + Capacitance + Temperature + Noise tables)
// ────────────────────────────────────────────────────────────────────────────

const DIODE_LEVEL_1: ModelParam[] = [
  // DC
  {
    name: "IS",
    label: "IS",
    unit: "A",
    defaultValue: 1e-14,
    description: "Saturation current",
    group: "DC",
  },
  { name: "N", label: "N", defaultValue: 1, description: "Emission coefficient", group: "DC" },
  {
    name: "RS",
    label: "RS",
    unit: "Ω",
    defaultValue: 0,
    description: "Series resistance",
    group: "DC",
  },
  {
    name: "BV",
    label: "BV",
    unit: "V",
    defaultValue: 1e30,
    description: "Reverse breakdown voltage (positive)",
    group: "DC",
  },
  {
    name: "IBV",
    label: "IBV",
    unit: "A",
    defaultValue: 1e-3,
    description: "Current at breakdown voltage",
    group: "DC",
  },
  {
    name: "NBV",
    label: "NBV",
    defaultValue: 1,
    description: "Breakdown emission coefficient",
    group: "DC",
  },
  {
    name: "IKF",
    label: "IKF",
    unit: "A",
    defaultValue: 0,
    description: "Forward knee current (high-injection roll-off)",
    group: "DC",
  },
  {
    name: "ISR",
    label: "ISR",
    unit: "A",
    defaultValue: 1e-14,
    description: "Recombination saturation current",
    group: "DC",
  },
  {
    name: "NR",
    label: "NR",
    defaultValue: 2,
    description: "Recombination current emission coefficient",
    group: "DC",
  },
  // Capacitance
  {
    name: "CJO",
    label: "CJO",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias junction capacitance",
    group: "Capacitance",
  },
  {
    name: "VJ",
    label: "VJ",
    unit: "V",
    defaultValue: 1,
    description: "Junction potential",
    group: "Capacitance",
  },
  {
    name: "M",
    label: "M",
    defaultValue: 0.5,
    description: "Grading coefficient",
    group: "Capacitance",
  },
  {
    name: "FC",
    label: "FC",
    defaultValue: 0.5,
    description: "Forward-bias depletion-cap formula coefficient",
    group: "Capacitance",
  },
  {
    name: "TT",
    label: "TT",
    unit: "s",
    defaultValue: 0,
    description: "Transit time",
    group: "Capacitance",
  },
  // Temperature
  {
    name: "EG",
    label: "EG",
    unit: "eV",
    defaultValue: 1.11,
    description: "Activation energy (1.11 Si, 0.67 Ge, 0.69 SBD)",
    group: "Temperature",
  },
  {
    name: "XTI",
    label: "XTI",
    defaultValue: 3,
    description: "Saturation current temperature exponent",
    group: "Temperature",
  },
  {
    name: "TNOM",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
  {
    name: "TCV",
    label: "TCV",
    unit: "1/°C",
    defaultValue: 0,
    description: "Breakdown voltage temperature coefficient",
    group: "Temperature",
  },
  // Noise
  {
    name: "KF",
    label: "KF",
    defaultValue: 0,
    description: "Flicker noise coefficient",
    group: "Noise",
  },
  {
    name: "AF",
    label: "AF",
    defaultValue: 1,
    description: "Flicker noise exponent",
    group: "Noise",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// BJT
// ngspice 7.3 Gummel-Poon Models (Level 1)
// Xyce 2.3.17.1 (Level 1, Gummel-Poon)
// ────────────────────────────────────────────────────────────────────────────

const BJT_LEVEL_1_GP: ModelParam[] = [
  // DC
  {
    name: "IS",
    label: "IS",
    unit: "A",
    defaultValue: 1e-16,
    description: "Transport saturation current",
    group: "DC",
  },
  {
    name: "BF",
    label: "BF",
    defaultValue: 100,
    description: "Ideal maximum forward beta",
    group: "DC",
  },
  {
    name: "NF",
    label: "NF",
    defaultValue: 1,
    description: "Forward emission coefficient",
    group: "DC",
  },
  {
    name: "VAF",
    label: "VAF",
    unit: "V",
    defaultValue: 1e30,
    description: "Forward Early voltage",
    group: "DC",
  },
  {
    name: "IKF",
    label: "IKF",
    unit: "A",
    defaultValue: 1e30,
    description: "Corner for forward beta high-current roll-off",
    group: "DC",
  },
  {
    name: "ISE",
    label: "ISE",
    unit: "A",
    defaultValue: 0,
    description: "B-E leakage saturation current",
    group: "DC",
  },
  {
    name: "NE",
    label: "NE",
    defaultValue: 1.5,
    description: "B-E leakage emission coefficient",
    group: "DC",
  },
  {
    name: "BR",
    label: "BR",
    defaultValue: 1,
    description: "Ideal maximum reverse beta",
    group: "DC",
  },
  {
    name: "NR",
    label: "NR",
    defaultValue: 1,
    description: "Reverse current emission coefficient",
    group: "DC",
  },
  {
    name: "VAR",
    label: "VAR",
    unit: "V",
    defaultValue: 1e30,
    description: "Reverse Early voltage",
    group: "DC",
  },
  {
    name: "IKR",
    label: "IKR",
    unit: "A",
    defaultValue: 1e30,
    description: "Reverse-beta high-current corner",
    group: "DC",
  },
  {
    name: "ISC",
    label: "ISC",
    unit: "A",
    defaultValue: 0,
    description: "B-C leakage saturation current",
    group: "DC",
  },
  {
    name: "NC",
    label: "NC",
    defaultValue: 2,
    description: "B-C leakage emission coefficient",
    group: "DC",
  },
  // Parasitics
  {
    name: "RB",
    label: "RB",
    unit: "Ω",
    defaultValue: 0,
    description: "Zero-bias base resistance",
    group: "Parasitics",
  },
  {
    name: "IRB",
    label: "IRB",
    unit: "A",
    defaultValue: 1e30,
    description: "Current where RB falls halfway to RBM",
    group: "Parasitics",
  },
  {
    name: "RBM",
    label: "RBM",
    unit: "Ω",
    defaultValue: 0,
    description: "Minimum base resistance at high current",
    group: "Parasitics",
  },
  {
    name: "RE",
    label: "RE",
    unit: "Ω",
    defaultValue: 0,
    description: "Emitter resistance",
    group: "Parasitics",
  },
  {
    name: "RC",
    label: "RC",
    unit: "Ω",
    defaultValue: 0,
    description: "Collector resistance",
    group: "Parasitics",
  },
  // Capacitance
  {
    name: "CJE",
    label: "CJE",
    unit: "F",
    defaultValue: 0,
    description: "B-E zero-bias depletion capacitance",
    group: "Capacitance",
  },
  {
    name: "VJE",
    label: "VJE",
    unit: "V",
    defaultValue: 0.75,
    description: "B-E built-in potential",
    group: "Capacitance",
  },
  {
    name: "MJE",
    label: "MJE",
    defaultValue: 0.33,
    description: "B-E junction grading exponent",
    group: "Capacitance",
  },
  {
    name: "CJC",
    label: "CJC",
    unit: "F",
    defaultValue: 0,
    description: "B-C zero-bias depletion capacitance",
    group: "Capacitance",
  },
  {
    name: "VJC",
    label: "VJC",
    unit: "V",
    defaultValue: 0.75,
    description: "B-C built-in potential",
    group: "Capacitance",
  },
  {
    name: "MJC",
    label: "MJC",
    defaultValue: 0.33,
    description: "B-C junction grading exponent",
    group: "Capacitance",
  },
  {
    name: "XCJC",
    label: "XCJC",
    defaultValue: 1,
    description: "Fraction of CJC connected to internal base",
    group: "Capacitance",
  },
  {
    name: "CJS",
    label: "CJS",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias collector-substrate cap",
    group: "Capacitance",
  },
  {
    name: "VJS",
    label: "VJS",
    unit: "V",
    defaultValue: 0.75,
    description: "Substrate junction potential",
    group: "Capacitance",
  },
  {
    name: "MJS",
    label: "MJS",
    defaultValue: 0,
    description: "Substrate junction grading exponent",
    group: "Capacitance",
  },
  {
    name: "FC",
    label: "FC",
    defaultValue: 0.5,
    description: "Forward-bias depletion-cap formula coeff",
    group: "Capacitance",
  },
  // Transit time
  {
    name: "TF",
    label: "TF",
    unit: "s",
    defaultValue: 0,
    description: "Ideal forward transit time",
    group: "Transit time",
  },
  {
    name: "XTF",
    label: "XTF",
    defaultValue: 0,
    description: "Bias dependence coefficient of TF",
    group: "Transit time",
  },
  {
    name: "VTF",
    label: "VTF",
    unit: "V",
    defaultValue: 1e30,
    description: "TF VBC voltage dependence",
    group: "Transit time",
  },
  {
    name: "ITF",
    label: "ITF",
    unit: "A",
    defaultValue: 0,
    description: "TF high-current effect parameter",
    group: "Transit time",
  },
  {
    name: "PTF",
    label: "PTF",
    unit: "deg",
    defaultValue: 0,
    description: "Excess phase at f = 1/(2π·TF)",
    group: "Transit time",
  },
  {
    name: "TR",
    label: "TR",
    unit: "s",
    defaultValue: 0,
    description: "Ideal reverse transit time",
    group: "Transit time",
  },
  // Temperature
  {
    name: "XTB",
    label: "XTB",
    defaultValue: 0,
    description: "Forward/reverse beta temperature exponent",
    group: "Temperature",
  },
  {
    name: "EG",
    label: "EG",
    unit: "eV",
    defaultValue: 1.11,
    description: "Bandgap for IS temperature effect",
    group: "Temperature",
  },
  {
    name: "XTI",
    label: "XTI",
    defaultValue: 3,
    description: "Temperature exponent for IS",
    group: "Temperature",
  },
  {
    name: "TNOM",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
  // Noise
  {
    name: "KF",
    label: "KF",
    defaultValue: 0,
    description: "Flicker noise coefficient",
    group: "Noise",
  },
  {
    name: "AF",
    label: "AF",
    defaultValue: 1,
    description: "Flicker noise exponent",
    group: "Noise",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// JFET
// ngspice 7.4.4 (Level 1) and 7.4.5 (Level 2, Parker-Skellern, ngspice only)
// ────────────────────────────────────────────────────────────────────────────

const JFET_LEVEL_1: ModelParam[] = [
  {
    name: "VTO",
    label: "VTO",
    unit: "V",
    defaultValue: -2,
    description: "Threshold voltage",
    group: "DC",
  },
  {
    name: "BETA",
    label: "BETA",
    unit: "A/V²",
    defaultValue: 1e-4,
    description: "Transconductance parameter",
    group: "DC",
  },
  {
    name: "LAMBDA",
    label: "LAMBDA",
    unit: "1/V",
    defaultValue: 0,
    description: "Channel-length modulation",
    group: "DC",
  },
  {
    name: "RD",
    label: "RD",
    unit: "Ω",
    defaultValue: 0,
    description: "Drain ohmic resistance",
    group: "DC",
  },
  {
    name: "RS",
    label: "RS",
    unit: "Ω",
    defaultValue: 0,
    description: "Source ohmic resistance",
    group: "DC",
  },
  {
    name: "IS",
    label: "IS",
    unit: "A",
    defaultValue: 1e-14,
    description: "Gate junction saturation current",
    group: "DC",
  },
  {
    name: "B",
    label: "B",
    defaultValue: 1,
    description: "Doping tail parameter (Parker-Skellern fitter)",
    group: "DC",
  },
  // Capacitance
  {
    name: "CGS",
    label: "CGS",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias G-S junction capacitance",
    group: "Capacitance",
  },
  {
    name: "CGD",
    label: "CGD",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias G-D junction capacitance",
    group: "Capacitance",
  },
  {
    name: "PB",
    label: "PB",
    unit: "V",
    defaultValue: 1,
    description: "Gate junction potential",
    group: "Capacitance",
  },
  {
    name: "FC",
    label: "FC",
    defaultValue: 0.5,
    description: "Forward-bias depletion-cap formula coeff",
    group: "Capacitance",
  },
  // Temperature
  {
    name: "TCV",
    label: "TCV",
    unit: "1/°C",
    defaultValue: 0,
    description: "VTO temperature coefficient",
    group: "Temperature",
  },
  {
    name: "BEX",
    label: "BEX",
    defaultValue: 0,
    description: "BETA mobility temperature exponent",
    group: "Temperature",
  },
  {
    name: "XTI",
    label: "XTI",
    defaultValue: 3,
    description: "Gate saturation current temp exponent",
    group: "Temperature",
  },
  {
    name: "EG",
    label: "EG",
    unit: "eV",
    defaultValue: 1.11,
    description: "Bandgap voltage",
    group: "Temperature",
  },
  {
    name: "TNOM",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
  // Noise
  {
    name: "KF",
    label: "KF",
    defaultValue: 0,
    description: "Flicker noise coefficient",
    group: "Noise",
  },
  {
    name: "AF",
    label: "AF",
    defaultValue: 1,
    description: "Flicker noise exponent",
    group: "Noise",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// MOSFET (classic levels 1, 2, 3, 6 — ngspice 7.6.2)
// ────────────────────────────────────────────────────────────────────────────

const MOSFET_CLASSIC_COMMON: ModelParam[] = [
  // DC
  {
    name: "VTO",
    label: "VTO",
    unit: "V",
    defaultValue: 0,
    description: "Zero-bias threshold voltage",
    group: "DC",
  },
  {
    name: "KP",
    label: "KP",
    unit: "A/V²",
    defaultValue: 2e-5,
    description: "Transconductance parameter",
    group: "DC",
  },
  {
    name: "GAMMA",
    label: "GAMMA",
    unit: "√V",
    defaultValue: 0,
    description: "Bulk threshold parameter",
    group: "DC",
  },
  {
    name: "PHI",
    label: "PHI",
    unit: "V",
    defaultValue: 0.6,
    description: "Surface potential",
    group: "DC",
  },
  {
    name: "LAMBDA",
    label: "LAMBDA",
    unit: "1/V",
    defaultValue: 0,
    description: "Channel-length modulation (Levels 1, 2)",
    group: "DC",
  },
  {
    name: "RD",
    label: "RD",
    unit: "Ω",
    defaultValue: 0,
    description: "Drain ohmic resistance",
    group: "Parasitics",
  },
  {
    name: "RS",
    label: "RS",
    unit: "Ω",
    defaultValue: 0,
    description: "Source ohmic resistance",
    group: "Parasitics",
  },
  {
    name: "RSH",
    label: "RSH",
    unit: "Ω/□",
    defaultValue: 0,
    description: "Drain/source sheet resistance",
    group: "Parasitics",
  },
  // Capacitance
  {
    name: "CBD",
    label: "CBD",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias B-D junction cap",
    group: "Capacitance",
  },
  {
    name: "CBS",
    label: "CBS",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias B-S junction cap",
    group: "Capacitance",
  },
  {
    name: "IS",
    label: "IS",
    unit: "A",
    defaultValue: 1e-14,
    description: "Bulk junction saturation current",
    group: "Capacitance",
  },
  {
    name: "PB",
    label: "PB",
    unit: "V",
    defaultValue: 0.8,
    description: "Bulk junction potential",
    group: "Capacitance",
  },
  {
    name: "CGSO",
    label: "CGSO",
    unit: "F/m",
    defaultValue: 0,
    description: "G-S overlap cap per channel-width meter",
    group: "Capacitance",
  },
  {
    name: "CGDO",
    label: "CGDO",
    unit: "F/m",
    defaultValue: 0,
    description: "G-D overlap cap per channel-width meter",
    group: "Capacitance",
  },
  {
    name: "CGBO",
    label: "CGBO",
    unit: "F/m",
    defaultValue: 0,
    description: "G-B overlap cap per channel-width meter",
    group: "Capacitance",
  },
  {
    name: "CJ",
    label: "CJ",
    unit: "F/m²",
    defaultValue: 0,
    description: "Bulk junction bottom cap per area",
    group: "Capacitance",
  },
  {
    name: "MJ",
    label: "MJ",
    defaultValue: 0.5,
    description: "Bulk junction bottom grading coeff",
    group: "Capacitance",
  },
  {
    name: "CJSW",
    label: "CJSW",
    unit: "F/m",
    defaultValue: 0,
    description: "Bulk junction sidewall cap per perimeter",
    group: "Capacitance",
  },
  {
    name: "MJSW",
    label: "MJSW",
    defaultValue: 0.33,
    description: "Bulk junction sidewall grading coeff",
    group: "Capacitance",
  },
  {
    name: "JS",
    label: "JS",
    unit: "A/m²",
    defaultValue: 0,
    description: "Bulk junction saturation current density",
    group: "Capacitance",
  },
  {
    name: "FC",
    label: "FC",
    defaultValue: 0.5,
    description: "Forward-bias depletion-cap formula coeff",
    group: "Capacitance",
  },
  // Process
  {
    name: "TOX",
    label: "TOX",
    unit: "m",
    defaultValue: 1e-7,
    description: "Oxide thickness",
    group: "Process",
  },
  {
    name: "NSUB",
    label: "NSUB",
    unit: "cm⁻³",
    defaultValue: 0,
    description: "Substrate doping",
    group: "Process",
  },
  {
    name: "NSS",
    label: "NSS",
    unit: "cm⁻²",
    defaultValue: 0,
    description: "Surface state density",
    group: "Process",
  },
  {
    name: "TPG",
    label: "TPG",
    defaultValue: 1,
    description: "Gate material: +1 opp, -1 same, 0 Al",
    group: "Process",
  },
  {
    name: "XJ",
    label: "XJ",
    unit: "m",
    defaultValue: 0,
    description: "Metallurgical junction depth",
    group: "Process",
  },
  {
    name: "LD",
    label: "LD",
    unit: "m",
    defaultValue: 0,
    description: "Lateral diffusion",
    group: "Process",
  },
  {
    name: "UO",
    label: "UO",
    unit: "cm²/V·s",
    defaultValue: 600,
    description: "Surface mobility",
    group: "Process",
  },
  // Temperature
  {
    name: "TNOM",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
  // Noise
  {
    name: "KF",
    label: "KF",
    defaultValue: 0,
    description: "Flicker noise coefficient",
    group: "Noise",
  },
  {
    name: "AF",
    label: "AF",
    defaultValue: 1,
    description: "Flicker noise exponent",
    group: "Noise",
  },
  {
    name: "NLEV",
    label: "NLEV",
    defaultValue: 1,
    description: "Noise equation selector",
    group: "Noise",
  },
];

const MOSFET_LEVEL_2_EXTRA: ModelParam[] = [
  {
    name: "UCRIT",
    label: "UCRIT",
    unit: "V/cm",
    defaultValue: 1e4,
    description: "Critical field for mobility degradation",
    group: "Level 2 effects",
  },
  {
    name: "UEXP",
    label: "UEXP",
    defaultValue: 0,
    description: "Critical field exponent in mobility degradation",
    group: "Level 2 effects",
  },
  {
    name: "VMAX",
    label: "VMAX",
    unit: "m/s",
    defaultValue: 0,
    description: "Maximum drift velocity of carriers",
    group: "Level 2 effects",
  },
  {
    name: "NEFF",
    label: "NEFF",
    defaultValue: 1,
    description: "Channel-charge coefficient",
    group: "Level 2 effects",
  },
  {
    name: "NFS",
    label: "NFS",
    unit: "cm⁻²",
    defaultValue: 0,
    description: "Fast surface state density",
    group: "Level 2 effects",
  },
  {
    name: "DELTA",
    label: "DELTA",
    defaultValue: 0,
    description: "Width effect on threshold voltage",
    group: "Level 2 effects",
  },
];

const MOSFET_LEVEL_3_EXTRA: ModelParam[] = [
  {
    name: "VMAX",
    label: "VMAX",
    unit: "m/s",
    defaultValue: 0,
    description: "Maximum drift velocity",
    group: "Level 3 effects",
  },
  {
    name: "NFS",
    label: "NFS",
    unit: "cm⁻²",
    defaultValue: 0,
    description: "Fast surface state density",
    group: "Level 3 effects",
  },
  {
    name: "DELTA",
    label: "DELTA",
    defaultValue: 0,
    description: "Width effect on threshold voltage",
    group: "Level 3 effects",
  },
  {
    name: "THETA",
    label: "THETA",
    unit: "1/V",
    defaultValue: 0,
    description: "Mobility modulation",
    group: "Level 3 effects",
  },
  {
    name: "ETA",
    label: "ETA",
    defaultValue: 0,
    description: "Static feedback",
    group: "Level 3 effects",
  },
  {
    name: "KAPPA",
    label: "KAPPA",
    defaultValue: 0.2,
    description: "Saturation field factor",
    group: "Level 3 effects",
  },
];

const ADVANCED_RAW_NOTE =
  "Compact model with 50+ parameters. Paste a full `.MODEL` card body in the textarea below; the editor will not validate field-by-field.";

// ────────────────────────────────────────────────────────────────────────────
// MESFET — only Statz (Level 1) common to both, plus ngspice-only variants
// ────────────────────────────────────────────────────────────────────────────

const MESFET_LEVEL_1_STATZ: ModelParam[] = [
  {
    name: "VTO",
    label: "VTO",
    unit: "V",
    defaultValue: -2,
    description: "Pinch-off voltage",
    group: "DC",
  },
  {
    name: "BETA",
    label: "BETA",
    unit: "A/V²",
    defaultValue: 1e-4,
    description: "Transconductance parameter",
    group: "DC",
  },
  {
    name: "B",
    label: "B",
    unit: "1/V",
    defaultValue: 0.3,
    description: "Doping tail extending parameter",
    group: "DC",
  },
  {
    name: "ALPHA",
    label: "ALPHA",
    unit: "1/V",
    defaultValue: 2,
    description: "Saturation voltage parameter",
    group: "DC",
  },
  {
    name: "LAMBDA",
    label: "LAMBDA",
    unit: "1/V",
    defaultValue: 0,
    description: "Channel-length modulation",
    group: "DC",
  },
  {
    name: "RD",
    label: "RD",
    unit: "Ω",
    defaultValue: 0,
    description: "Drain ohmic resistance",
    group: "DC",
  },
  {
    name: "RS",
    label: "RS",
    unit: "Ω",
    defaultValue: 0,
    description: "Source ohmic resistance",
    group: "DC",
  },
  {
    name: "CGS",
    label: "CGS",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias G-S junction capacitance",
    group: "Capacitance",
  },
  {
    name: "CGD",
    label: "CGD",
    unit: "F",
    defaultValue: 0,
    description: "Zero-bias G-D junction capacitance",
    group: "Capacitance",
  },
  {
    name: "PB",
    label: "PB",
    unit: "V",
    defaultValue: 1,
    description: "Gate junction potential",
    group: "Capacitance",
  },
  {
    name: "IS",
    label: "IS",
    unit: "A",
    defaultValue: 1e-14,
    description: "Gate junction saturation current",
    group: "Capacitance",
  },
  {
    name: "FC",
    label: "FC",
    defaultValue: 0.5,
    description: "Forward-bias depletion-cap formula coeff",
    group: "Capacitance",
  },
  {
    name: "TNOM",
    label: "TNOM",
    unit: "°C",
    defaultValue: 27,
    description: "Parameter measurement temperature",
    group: "Temperature",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Switch (voltage-controlled SW, current-controlled CSW)
// ngspice 3.3.16
// ────────────────────────────────────────────────────────────────────────────

const SWITCH_VOLTAGE_MODEL: ModelParam[] = [
  {
    name: "VT",
    label: "VT",
    unit: "V",
    defaultValue: 0,
    description: "Threshold voltage",
    group: "Switch",
  },
  {
    name: "VH",
    label: "VH",
    unit: "V",
    defaultValue: 0,
    description: "Hysteresis voltage",
    group: "Switch",
  },
  {
    name: "RON",
    label: "RON",
    unit: "Ω",
    defaultValue: 1,
    description: "On-resistance",
    group: "Switch",
  },
  {
    name: "ROFF",
    label: "ROFF",
    unit: "Ω",
    defaultValue: 1e12,
    description: "Off-resistance",
    group: "Switch",
  },
];

const SWITCH_CURRENT_MODEL: ModelParam[] = [
  {
    name: "IT",
    label: "IT",
    unit: "A",
    defaultValue: 0,
    description: "Threshold current",
    group: "Switch",
  },
  {
    name: "IH",
    label: "IH",
    unit: "A",
    defaultValue: 0,
    description: "Hysteresis current",
    group: "Switch",
  },
  {
    name: "RON",
    label: "RON",
    unit: "Ω",
    defaultValue: 1,
    description: "On-resistance",
    group: "Switch",
  },
  {
    name: "ROFF",
    label: "ROFF",
    unit: "Ω",
    defaultValue: 1e12,
    description: "Off-resistance",
    group: "Switch",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Public registry
// ────────────────────────────────────────────────────────────────────────────

export const DEVICE_MODELS: Record<string, DeviceConfig> = {
  resistor: {
    defaultLevel: 0,
    levels: [
      { level: 0, name: "Linear (instance only)", simulator: "both", params: RESISTOR_INSTANCE },
      {
        level: 1,
        name: "Semiconductor / sheet resistance",
        simulator: "both",
        params: [...RESISTOR_INSTANCE, ...RESISTOR_MODEL],
      },
    ],
  },
  capacitor: {
    defaultLevel: 0,
    levels: [
      { level: 0, name: "Linear (instance only)", simulator: "both", params: CAPACITOR_INSTANCE },
      {
        level: 1,
        name: "Semiconductor / geometry-based",
        simulator: "both",
        params: [...CAPACITOR_INSTANCE, ...CAPACITOR_MODEL],
      },
    ],
  },
  inductor: {
    defaultLevel: 0,
    levels: [
      { level: 0, name: "Linear (instance only)", simulator: "both", params: INDUCTOR_INSTANCE },
      {
        level: 1,
        name: "Model-based (with parasitics)",
        simulator: "both",
        params: [...INDUCTOR_INSTANCE, ...INDUCTOR_MODEL],
      },
    ],
  },
  switch: {
    defaultLevel: 1,
    levels: [
      {
        level: 1,
        name: "Voltage-controlled (SW)",
        simulator: "both",
        params: SWITCH_VOLTAGE_MODEL,
      },
      {
        level: 2,
        name: "Current-controlled (CSW)",
        simulator: "both",
        params: SWITCH_CURRENT_MODEL,
      },
      { level: 3, name: "Generic (expr)", simulator: "xyce", params: [], raw: true },
    ],
  },
  diode: {
    defaultLevel: 1,
    levels: [
      { level: 1, name: "Shockley (Level 1)", simulator: "both", params: DIODE_LEVEL_1 },
      { level: 2, name: "Extended (Xyce Level 2)", simulator: "xyce", params: [], raw: true },
      {
        level: 99,
        name: "JUNCAP2 / DIODE_CMC (OpenVAF)",
        simulator: "ngspice",
        params: [],
        raw: true,
      },
    ],
  },
  bjt: {
    defaultLevel: 1,
    levels: [
      { level: 1, name: "Gummel-Poon", simulator: "both", params: BJT_LEVEL_1_GP },
      { level: 9, name: "VBIC (Xyce L9)", simulator: "xyce", params: [], raw: true },
      { level: 11, name: "VBIC 1.3 (Xyce L11)", simulator: "xyce", params: [], raw: true },
      { level: 12, name: "VBIC 1.3 (Xyce L12)", simulator: "xyce", params: [], raw: true },
      { level: 23, name: "FBH HBT_X", simulator: "xyce", params: [], raw: true },
      { level: 230, name: "HICUM/L0", simulator: "both", params: [], raw: true },
      { level: 234, name: "HICUM/L2", simulator: "both", params: [], raw: true },
      { level: 504, name: "MEXTRAM 504", simulator: "both", params: [], raw: true },
      { level: 505, name: "MEXTRAM 505", simulator: "xyce", params: [], raw: true },
    ],
  },
  jfet: {
    defaultLevel: 1,
    levels: [
      {
        level: 1,
        name: "SPICE JFET (Shichman-Hodges + Parker-Skellern)",
        simulator: "both",
        params: JFET_LEVEL_1,
      },
      {
        level: 2,
        name: "Parker-Skellern microwave JFET",
        simulator: "ngspice",
        params: [],
        raw: true,
      },
    ],
  },
  mesfet: {
    defaultLevel: 1,
    levels: [
      {
        level: 1,
        name: "Statz (MESA / GaAs FET)",
        simulator: "both",
        params: MESFET_LEVEL_1_STATZ,
      },
      { level: 2, name: "Ytterdal", simulator: "ngspice", params: [], raw: true },
      { level: 5, name: "hfet1 (HFET)", simulator: "ngspice", params: [], raw: true },
      { level: 6, name: "hfet2 (HFET)", simulator: "ngspice", params: [], raw: true },
    ],
  },
  mosfet: {
    defaultLevel: 1,
    levels: [
      {
        level: 1,
        name: "Shichman-Hodges (MOS Level 1)",
        simulator: "both",
        params: MOSFET_CLASSIC_COMMON,
      },
      {
        level: 2,
        name: "Grove-Frohman (MOS Level 2)",
        simulator: "both",
        params: [...MOSFET_CLASSIC_COMMON, ...MOSFET_LEVEL_2_EXTRA],
      },
      {
        level: 3,
        name: "Semi-empirical (MOS Level 3)",
        simulator: "both",
        params: [...MOSFET_CLASSIC_COMMON, ...MOSFET_LEVEL_3_EXTRA],
      },
      {
        level: 6,
        name: "Sakurai-Newton (MOS Level 6)",
        simulator: "both",
        params: MOSFET_CLASSIC_COMMON,
      },
      {
        level: 9,
        name: "MOS9 (modified Level 3)",
        simulator: "both",
        params: MOSFET_CLASSIC_COMMON,
      },
      {
        level: 14,
        name: "BSIM4 (ngspice L14/L54, Xyce L14)",
        simulator: "both",
        params: [],
        raw: true,
      },
      {
        level: 49,
        name: "BSIM3 v3.x (ngspice L8/L49)",
        simulator: "ngspice",
        params: [],
        raw: true,
      },
      { level: 18, name: "VDMOS / Power MOSFET", simulator: "both", params: [], raw: true },
      { level: 10, name: "BSIM-SOI v3.2", simulator: "both", params: [], raw: true },
      { level: 70, name: "BSIM-SOI 4.6.1", simulator: "xyce", params: [], raw: true },
      { level: 77, name: "BSIM6 v6.1.1", simulator: "xyce", params: [], raw: true },
      { level: 102, name: "PSP v102.5", simulator: "xyce", params: [], raw: true },
      { level: 103, name: "PSP v103.4", simulator: "xyce", params: [], raw: true },
      { level: 107, name: "BSIM-CMG v107 (FinFET)", simulator: "xyce", params: [], raw: true },
      { level: 110, name: "BSIM-CMG v110 (FinFET)", simulator: "xyce", params: [], raw: true },
      { level: 260, name: "EKV 2.6", simulator: "xyce", params: [], raw: true },
      { level: 301, name: "EKV 3.0.1", simulator: "xyce", params: [], raw: true },
      { level: 2000, name: "MVS 2.0.0", simulator: "xyce", params: [], raw: true },
      {
        level: 10240,
        name: "L_UTSOI v102.4 (UTBB FD-SOI)",
        simulator: "xyce",
        params: [],
        raw: true,
      },
      { level: 68, name: "HiSIM2", simulator: "ngspice", params: [], raw: true },
      { level: 73, name: "HiSIM_HV", simulator: "ngspice", params: [], raw: true },
    ],
  },
};

export const ADVANCED_MODEL_NOTE = ADVANCED_RAW_NOTE;
