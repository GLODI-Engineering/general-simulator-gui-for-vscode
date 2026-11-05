import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOCKS_DIR = resolve(__dirname, "../../packages/blocks/src/blocks");

const SPEC_15_2_TO_15_6_TYPES = [
  // §15.2 physical-electrical
  "physical-electrical.passive.resistor",
  "physical-electrical.passive.capacitor",
  "physical-electrical.passive.inductor",
  "physical-electrical.passive.mutual_inductor",
  "physical-electrical.passive.transformer",
  "physical-electrical.passive.memristor",
  "physical-electrical.passive.gyrator",
  "physical-electrical.source.voltage_dc",
  "physical-electrical.source.current_dc",
  "physical-electrical.source.voltage_ac",
  "physical-electrical.source.current_ac",
  "physical-electrical.source.voltage_pulse",
  "physical-electrical.source.voltage_pwl",
  "physical-electrical.source.vcvs",
  "physical-electrical.source.vccs",
  "physical-electrical.source.ccvs",
  "physical-electrical.source.cccs",
  "physical-electrical.source.controlled_voltage",
  "physical-electrical.source.controlled_current",
  "physical-electrical.semiconductor.diode",
  "physical-electrical.semiconductor.led",
  "physical-electrical.semiconductor.photodiode",
  "physical-electrical.semiconductor.zener",
  "physical-electrical.semiconductor.bjt_npn",
  "physical-electrical.semiconductor.bjt_pnp",
  "physical-electrical.semiconductor.mosfet_n",
  "physical-electrical.semiconductor.mosfet_p",
  "physical-electrical.semiconductor.igbt_n",
  "physical-electrical.semiconductor.thyristor",
  "physical-electrical.switch.voltage_controlled",
  "physical-electrical.switch.current_controlled",
  "physical-electrical.switch.generic",
  "physical-electrical.opamp.ideal",
  "physical-electrical.opamp.finite_gain",
  "physical-electrical.opamp.band_limited",
  "physical-electrical.opamp.comparator",
  "physical-electrical.sensor.voltage",
  "physical-electrical.sensor.current",
  "physical-electrical.reference.ground",
  "physical-electrical.tline.lossless",
  "physical-electrical.tline.lossy",

  // §15.3 physical-translational
  "physical-translational.element.mass",
  "physical-translational.element.spring",
  "physical-translational.element.damper",
  "physical-translational.element.friction",
  "physical-translational.element.hard_stop",
  "physical-translational.reference.world",
  "physical-translational.source.force",
  "physical-translational.source.velocity",
  "physical-translational.sensor.force",
  "physical-translational.sensor.velocity",
  "physical-translational.sensor.position",

  // §15.4 physical-rotational
  "physical-rotational.element.inertia",
  "physical-rotational.element.spring",
  "physical-rotational.element.damper",
  "physical-rotational.element.friction",
  "physical-rotational.element.hard_stop",
  "physical-rotational.reference.world",
  "physical-rotational.source.torque",
  "physical-rotational.source.angular_velocity",
  "physical-rotational.sensor.torque",
  "physical-rotational.sensor.angular_velocity",
  "physical-rotational.sensor.angle",

  // §15.5 physical-thermal
  "physical-thermal.element.mass",
  "physical-thermal.element.resistance",
  "physical-thermal.element.conduction",
  "physical-thermal.element.convection",
  "physical-thermal.element.radiation",
  "physical-thermal.reference.absolute",
  "physical-thermal.source.heat_flow",
  "physical-thermal.source.temperature",
  "physical-thermal.source.controlled_heat_flow",
  "physical-thermal.source.controlled_temperature",
  "physical-thermal.sensor.heat_flow",
  "physical-thermal.sensor.temperature",

  // §15.6 converters
  "converter.signal_to_physical_signal",
  "converter.physical_signal_to_signal",
  "converter.rotational_to_translational",
  "converter.translational_to_rotational",
  "converter.electrical_to_rotational",
  "converter.rotational_to_electrical",
  "converter.electrical_to_translational",
  "converter.translational_to_electrical",
  "converter.electrical_to_thermal",
] as const;

function metadataPathFor(type: string): string {
  return resolve(BLOCKS_DIR, ...type.split("."), "metadata.yaml");
}

function fidelityTiersFor(type: string): Set<string> {
  const content = readFileSync(metadataPathFor(type), "utf-8");
  const tiers = new Set<string>();
  const tierRegex = /tier\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
  for (const match of content.matchAll(tierRegex)) {
    tiers.add(match[1]);
  }
  return tiers;
}

describe("FE-55 physical catalog", () => {
  it("test_physical_catalog: every type in spec §15.2-§15.6 has a metadata.yaml on disk", () => {
    const missing = SPEC_15_2_TO_15_6_TYPES.filter((type) => !existsSync(metadataPathFor(type)));
    expect(missing).toEqual([]);
  });

  it("test_physical_catalog: physical-electrical.passive.resistor declares fidelities for ideal, behavioral, spice", () => {
    const tiers = fidelityTiersFor("physical-electrical.passive.resistor");
    expect(tiers.has("ideal")).toBe(true);
    expect(tiers.has("behavioral")).toBe(true);
    expect(tiers.has("spice")).toBe(true);
  });

  it("test_physical_catalog: physical-thermal.element.mass declares fidelities at least for ideal", () => {
    const tiers = fidelityTiersFor("physical-thermal.element.mass");
    expect(tiers.has("ideal")).toBe(true);
  });
});
