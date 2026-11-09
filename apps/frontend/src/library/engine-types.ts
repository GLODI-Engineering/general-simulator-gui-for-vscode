/**
 * Which catalogue block is which engine type.
 *
 * The engine declares what it can compile in `engine-capabilities.json`, generated from its
 * own registry. It spells a type `source.voltage.dc`; a schematic spells the same component
 * `physical-electrical.source.voltage_dc`. Nothing bridged the two, so `supportsBlock`
 * compared them directly and matched **none** of the catalogue's 143 types — every block on
 * every sheet reported "not supported by the simulator", and a pulse source was simply where
 * someone noticed.
 *
 * This is that bridge, and it is deliberately short.
 *
 * ## Why not generate it
 *
 * Because name similarity is not correspondence, and the cases where it fails are the ones
 * that matter. Matching on leaf names pairs `passive.switch.ideal` with
 * `physical-electrical.opamp.ideal` — both end in "ideal". Matching on parameters is better
 * and still not enough: the engine's ideal switch is parameterised by **conductances**
 * (`g_on`, `g_off`, `v_th`) and the catalogue's switch by **resistances** (`r_on`, `r_off`,
 * `threshold`). Those are different models of the device, not two spellings of one, and a
 * mapping between them is a reciprocal, not a rename.
 *
 * So every pair below was checked both ways — the concept, and that the engine's required
 * parameters all exist on the catalogue entry. A pair that fails the second test is not here;
 * it is in {@link KNOWN_DIVERGENCES} with what differs. Reporting such a block unsupported is
 * the honest answer: compiling it would put the wrong numbers on the card, which is worse than
 * refusing.
 */

/** Catalogue type -> the engine type it compiles to. */
export const CATALOG_TO_ENGINE: Readonly<Record<string, string>> = {
  "physical-electrical.reference.ground": "routing.ground",
  "physical-electrical.passive.resistor": "passive.resistor",
  "physical-electrical.passive.capacitor": "passive.capacitor",
  "physical-electrical.passive.inductor": "passive.inductor",
  "physical-electrical.source.voltage_dc": "source.voltage.dc",
  "physical-electrical.source.current_dc": "source.current.dc",
  "signal-flow.math.gain": "control.gain",
  "signal-flow.math.sum": "control.sum",
  "signal-flow.math.product": "control.product",
  "signal-flow.continuous.integrator": "control.integrator",
  "signal-flow.continuous.derivative": "control.derivative",
  "signal-flow.continuous.state_space": "control.state_space",
  "signal-flow.continuous.transfer_function": "control.transfer_function",
  "signal-flow.discrete.unit_delay": "control.delay",
  "signal-flow.source.constant": "source.const",
};

/**
 * Pairs that look like a match and are not, with what differs.
 *
 * Kept as data rather than left out, so the gap is a decision someone can read and revisit
 * instead of an absence nobody notices. Each needs a parameter translation — or a change on
 * one side — before it can move into {@link CATALOG_TO_ENGINE}.
 */
export const KNOWN_DIVERGENCES: ReadonlyArray<{
  catalogType: string;
  engineType: string;
  differs: string;
}> = [
  {
    catalogType: "physical-electrical.switch.generic",
    engineType: "passive.switch.ideal",
    differs:
      "the engine takes conductances (g_on, g_off, v_th, plus a breakdown pair); the " +
      "catalogue takes resistances (r_on, r_off, threshold). A reciprocal, not a rename.",
  },
  {
    catalogType: "physical-electrical.semiconductor.diode",
    engineType: "passive.diode.ideal",
    differs:
      "the engine's ideal diode is piecewise-linear (g_on, g_off, v_th, breakdown); the " +
      "catalogue entry names a SPICE `model` instead.",
  },
  {
    catalogType: "physical-electrical.source.vcvs",
    engineType: "source.dependent.vcvs",
    differs: "gain is `gain` on the engine and `a` in the catalogue — a rename, unverified.",
  },
  {
    catalogType: "physical-electrical.source.vccs",
    engineType: "source.dependent.vccs",
    differs: "gain is `gain` on the engine and `g` in the catalogue.",
  },
  {
    catalogType: "physical-electrical.source.cccs",
    engineType: "source.dependent.cccs",
    differs:
      "the engine also needs `control` — the name of the element whose current is sensed — " +
      "which the catalogue entry does not carry at all.",
  },
  {
    catalogType: "physical-electrical.source.ccvs",
    engineType: "source.dependent.ccvs",
    differs: "as cccs: the engine needs a `control` element name the catalogue lacks.",
  },
  {
    catalogType: "signal-flow.continuous.pid",
    engineType: "control.pid",
    differs:
      "the engine clamps with `clamp_lo`/`clamp_hi`; the catalogue has a `form` parameter " +
      "and no clamp.",
  },
  {
    catalogType: "signal-flow.discontinuity.saturation",
    engineType: "control.saturation",
    differs: "the engine's symmetric `limit` has no counterpart in the catalogue entry.",
  },
  {
    catalogType: "signal-flow.source.sine",
    engineType: "source.sinwave",
    differs:
      "every field is named differently (va/freq/v0/td/theta against " +
      "amplitude/frequency/bias/sample_time), so this is a translation table, not a rename.",
  },
  {
    catalogType: "signal-flow.source.pulse",
    engineType: "source.pulsewave",
    differs:
      "the engine uses SPICE's PULSE fields (v1 v2 td tr tf pw per); the catalogue uses " +
      "amplitude/period/phase_delay/pulse_width.",
  },
];

/** The engine type a catalogue block compiles to, or `undefined` if nothing maps it. */
export function engineTypeOf(catalogType: string): string | undefined {
  return CATALOG_TO_ENGINE[catalogType];
}
