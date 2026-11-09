import engineCapabilities from "./engine-capabilities.json";
import { engineTypeOf } from "./engine-types";

/**
 * What the engine says it can compile, read from its own generated manifest.
 *
 * `engine-capabilities.json` is written by `scripts/gen-engine-capabilities.mjs` straight
 * from `gsim_py.capabilities()`, and a CI check fails when the committed copy stops matching.
 * So this is a cache of the engine's answer rather than a second opinion about it — which is
 * the whole point, because the second opinion is what drifted.
 */
const ENGINE_TYPES: ReadonlySet<string> = new Set(
  (engineCapabilities as { types: Array<{ type: string }> }).types.map((entry) => entry.type),
);

export interface SimulatorCompat {
  id: string;
  label: string;
  /** Block types this simulator can compile. */
  supported: string[];
  /**
   * Which device-model levels this simulator can actually run, per device
   * family (the keys of `DEVICE_MODELS`).
   *
   * This is the half that was missing. Knowing a simulator supports a
   * resistor says nothing about whether it can run a semiconductor
   * resistance model, and the parameter panel was offering every level of
   * every device to every simulator — so a sheet targeting a solver that
   * models switches as ideal still presented ngspice's SW and CSW model
   * cards, with a full set of parameters that would be silently dropped.
   *
   * An empty array means "this device exists, but only as its instance
   * parameters" — an ideal element with no model card. A family absent
   * from the map means the same thing; it is written out for the families
   * a simulator actually has, so the intent is visible rather than implied.
   */
  deviceLevels: Record<string, number[]>;
}

export interface SimulatorCompatMap {
  simulators: SimulatorCompat[];
}

// Inline data derived from simulator-compat.yaml to avoid runtime YAML parsing in the browser.
//
// v1 ships general-simulator as the only target. `supported` is every type in
// gsim-core's netlist-compiler registry (crates/gsim-core/src/compile/spec.rs)
// except the internal `spice-subckt.boundary` pseudo-block.
const COMPAT_DATA: SimulatorCompatMap = {
  simulators: [
    {
      id: "general-simulator",
      label: "General Simulator",
      supported: [
        // Structural / routing
        "routing.ground",
        "routing.goto",
        "routing.from",
        // Passives
        "passive.resistor",
        "passive.capacitor",
        "passive.inductor",
        // Independent sources
        "source.voltage.dc",
        "source.voltage.sin",
        "source.current.dc",
        // Dependent sources
        "source.dependent.vcvs",
        "source.dependent.vccs",
        "source.dependent.cccs",
        "source.dependent.ccvs",
        // Switching devices
        "passive.switch.ideal",
        "passive.diode.ideal",
        // Signal <-> physical converters
        "converter.sig2phys",
        "converter.phys2sig",
        // Signal sources
        "source.const",
        "source.time",
        "source.sinwave",
        "source.pulsewave",
        "source.expwave",
        "source.sffmwave",
        // PWM modulators
        "power.pwm1",
        "power.pwm2",
        // Control
        "control.gain",
        "control.saturation",
        "control.vco",
        "control.integrator",
        "control.derivative",
        "control.delay",
        "control.sum",
        "control.product",
        "control.pid",
        "control.counter",
        // Linear dynamics
        "control.state_space",
        "control.discrete_state_space",
        "control.transfer_function",
        "control.discrete_transfer_function",
        // Coordinate transforms
        "control.transform.clarke",
        "control.transform.clarke_inv",
        "control.transform.park",
        "control.transform.park_inv",
        "control.transform.clarke_park",
        "control.transform.clarke_park_inv",
        // Machines
        "machine.pmsm",
        // Math
        "math.table_lookup",
        "math.fn1",
        "math.fn2",
        "math.fn3",
        // Logic
        "logic.hysteresis",
        "logic.gate",
        "logic.sr_latch",
        "logic.flip_flop",
        // Script-hosted blocks
        "extensibility.cscript",
        "extensibility.pyblock",
        "extensibility.pyfunc",
        "extensibility.octfunc",
        "extensibility.octblock",
      ],
      // General Simulator models every device it has as ideal: its netlist
      // compiler has no `.MODEL` card concept, so no level of any family is
      // available. Written out per family rather than left empty, so that
      // adding a model later is an edit to a line that already exists.
      deviceLevels: {
        resistor: [],
        capacitor: [],
        inductor: [],
        switch: [],
        diode: [],
      },
    },
  ],
};

/** The contract for one simulator, or undefined if it is not configured. */
export function simulatorContract(simulatorId: string): SimulatorCompat | undefined {
  return COMPAT_DATA.simulators.find((entry) => entry.id === simulatorId);
}

/**
 * Whether this simulator can compile a block type.
 *
 * "all" is the palette's browse-everything mode rather than a simulator, so
 * it supports everything by construction.
 */
export function supportsBlock(simulatorId: string, blockType: string): boolean {
  if (simulatorId === "all") return true;
  const contract = simulatorContract(simulatorId);
  if (!contract) return true;

  // The engine's own declaration decides, not a list kept here. `blockType` is the
  // catalogue's spelling and the manifest uses the engine's, so it is translated first —
  // see `engine-types.ts` for why that bridge is hand-checked rather than derived.
  //
  // This used to be `contract.supported.includes(blockType)`, comparing a catalogue type
  // against engine names directly. It matched none of the catalogue's 143 types, so every
  // block reported unsupported and the one honest "no" was lost among 143 wrong ones.
  // Either vocabulary is accepted. A caller holding an engine type — a netlist importer, a
  // test, the compile path itself — should not have to know it is on the other side of the
  // bridge to ask a question about it.
  if (engineDeclaresType(blockType)) return true;

  const engineType = engineTypeOf(blockType);
  if (engineType === undefined) return false;
  return engineDeclaresType(engineType);
}

/** Every type the engine declares it can compile. */
export function engineSupportedTypes(): ReadonlySet<string> {
  return ENGINE_TYPES;
}

function engineDeclaresType(engineType: string): boolean {
  return ENGINE_TYPES.has(engineType);
}

/**
 * The model levels this simulator offers for a device family.
 *
 * Returns every level when the simulator is unknown or is the browse-all
 * mode, because hiding levels from someone who has not chosen a target is
 * worse than showing one they cannot run — they have not said what they are
 * aiming at yet.
 */
export function allowedModelLevels(
  simulatorId: string,
  family: string,
  allLevels: number[],
): number[] {
  if (simulatorId === "all") return allLevels;
  const contract = simulatorContract(simulatorId);
  if (!contract) return allLevels;
  const allowed = contract.deviceLevels[family] ?? [];
  return allLevels.filter((level) => allowed.includes(level));
}

export function loadSimulatorCompat(): SimulatorCompatMap {
  return COMPAT_DATA;
}
