/**
 * Which catalogue block is which engine type.
 *
 * The engine is authoritative. It declares what it can compile and what each component's card
 * reads, in `engine-capabilities.json`; the catalogue follows. Where the two disagreed about a
 * component's parameters, the catalogue was changed — the engine's ideal switch is
 * parameterised by conductances, so `physical-electrical.switch.generic` is now too, rather
 * than the two being bridged by a reciprocal nobody would remember to maintain.
 *
 * What remains here is only the spelling: a sheet carries
 * `physical-electrical.source.voltage_dc` and the engine calls the same component
 * `source.voltage.dc`. Nothing bridged those, so `supportsBlock` compared them directly and
 * matched **none** of the catalogue's 143 types — every block on every sheet reported "not
 * supported by the simulator", and a pulse source was simply where someone noticed.
 *
 * ## Why this is not generated
 *
 * Name similarity is not correspondence, and the failures are the cases that matter: matching
 * on leaf names pairs `passive.switch.ideal` with `physical-electrical.opamp.ideal`, because
 * both end in "ideal". Every pair below was checked twice — that it is the same component, and
 * that every parameter the engine requires now exists on the catalogue entry with that name.
 * A test asserts the second half on every build, so a pair cannot quietly stop being true.
 */

/** Catalogue type -> the engine type it compiles to. */
export const CATALOG_TO_ENGINE: Readonly<Record<string, string>> = {
  "physical-electrical.reference.ground": "routing.ground",
  "physical-electrical.passive.resistor": "passive.resistor",
  "physical-electrical.passive.capacitor": "passive.capacitor",
  "physical-electrical.passive.inductor": "passive.inductor",
  "physical-electrical.source.voltage_dc": "source.voltage.dc",
  "physical-electrical.source.voltage_pulse": "source.voltage.pulse",
  "physical-electrical.source.current_dc": "source.current.dc",
  "physical-electrical.source.vcvs": "source.dependent.vcvs",
  "physical-electrical.source.vccs": "source.dependent.vccs",
  "physical-electrical.source.cccs": "source.dependent.cccs",
  "physical-electrical.source.ccvs": "source.dependent.ccvs",
  "physical-electrical.switch.generic": "passive.switch.ideal",
  "physical-electrical.semiconductor.diode": "passive.diode.ideal",
  "signal-flow.math.gain": "control.gain",
  "signal-flow.math.sum": "control.sum",
  "signal-flow.math.product": "control.product",
  "signal-flow.continuous.pid": "control.pid",
  "signal-flow.continuous.integrator": "control.integrator",
  "signal-flow.continuous.derivative": "control.derivative",
  "signal-flow.discontinuity.saturation": "control.saturation",
  "signal-flow.continuous.state_space": "control.state_space",
  "signal-flow.continuous.transfer_function": "control.transfer_function",
  "signal-flow.discrete.unit_delay": "control.delay",
  "signal-flow.source.constant": "source.const",
  "signal-flow.source.sine": "source.sinwave",
  "signal-flow.source.pulse": "source.pulsewave",
};

/**
 * Pairs that look like a match and are not, with what differs.
 *
 * Empty, and kept so that the next disagreement is recorded rather than silently bridged. A
 * pair belongs here when the engine needs a parameter the catalogue cannot supply — compiling
 * it would put wrong numbers on the card, which is worse than reporting it unsupported.
 */
export const KNOWN_DIVERGENCES: ReadonlyArray<{
  catalogType: string;
  engineType: string;
  differs: string;
}> = [];

/** The engine type a catalogue block compiles to, or `undefined` if nothing maps it. */
export function engineTypeOf(catalogType: string): string | undefined {
  return CATALOG_TO_ENGINE[catalogType];
}
