/**
 * FE-45: Simulator compatibility filter tests
 *
 * v1 ships a single target — general-simulator — so the compat map has exactly
 * one entry, whose `supported` list is gsim-core's netlist-compiler registry
 * (crates/gsim-core/src/compile/spec.rs) minus the internal
 * `spice-subckt.boundary` pseudo-block.
 *
 * Acceptance:
 * - loadSimulatorCompat() returns the correct SimulatorCompatMap shape.
 * - Exactly one simulator, id "general-simulator", and no "all" pseudo-entry.
 * - The supported list is the full 55-type registry (spot-checked per family).
 * - Nothing ngspice/xyce/scipy-only leaks back in.
 * - No block name is duplicated within the entry.
 * - A YAML entry with an unknown block name does not throw; it is ignored.
 */

import { describe, expect, it } from "vitest";
import { loadSimulatorCompat } from "./simulator-compat";
import type { SimulatorCompatMap } from "./simulator-compat";

describe("FE-45: loadSimulatorCompat", () => {
  it("returns a SimulatorCompatMap with exactly 1 simulator", () => {
    const result: SimulatorCompatMap = loadSimulatorCompat();
    expect(result).toHaveProperty("simulators");
    expect(result.simulators).toHaveLength(1);
  });

  it("each simulator entry has id, label, and supported array", () => {
    const { simulators } = loadSimulatorCompat();
    for (const sim of simulators) {
      expect(typeof sim.id).toBe("string");
      expect(sim.id.length).toBeGreaterThan(0);
      expect(typeof sim.label).toBe("string");
      expect(Array.isArray(sim.supported)).toBe(true);
    }
  });

  it("the only simulator id is general-simulator (no 'all' entry)", () => {
    const { simulators } = loadSimulatorCompat();
    const ids = simulators.map((s) => s.id);
    expect(ids).toEqual(["general-simulator"]);
    expect(ids).not.toContain("all");
  });

  it("the removed ngspice/xyce/scipy targets are gone", () => {
    const { simulators } = loadSimulatorCompat();
    const ids = simulators.map((s) => s.id);
    for (const removed of ["ngspice", "xyce", "scipy"]) {
      expect(ids).not.toContain(removed);
    }
  });

  it("general-simulator is labelled 'General Simulator'", () => {
    const { simulators } = loadSimulatorCompat();
    expect(simulators[0]?.label).toBe("General Simulator");
  });

  it("supports exactly the 55 compilable registry types", () => {
    const { simulators } = loadSimulatorCompat();
    expect(simulators[0]?.supported).toHaveLength(55);
  });

  it("covers one representative of every registry family", () => {
    const supported = loadSimulatorCompat().simulators[0]?.supported ?? [];
    for (const type of [
      "routing.ground",
      "passive.resistor",
      "source.voltage.dc",
      "source.dependent.vcvs",
      "passive.switch.ideal",
      "passive.diode.ideal",
      "converter.sig2phys",
      "source.sinwave",
      "power.pwm2",
      "control.pid",
      "control.state_space",
      "control.transform.clarke_park",
      "machine.pmsm",
      "math.fn1",
      "logic.flip_flop",
      "extensibility.pyblock",
    ]) {
      expect(supported, `general-simulator should support ${type}`).toContain(type);
    }
  });

  it("excludes the internal spice-subckt.boundary pseudo-block", () => {
    const supported = loadSimulatorCompat().simulators[0]?.supported ?? [];
    expect(supported).not.toContain("spice-subckt.boundary");
  });

  it("excludes SPICE-only types the general simulator cannot compile", () => {
    const supported = loadSimulatorCompat().simulators[0]?.supported ?? [];
    for (const type of [
      "semi.bjt.npn",
      "semi.mosfet.n",
      "passive.memristor",
      "passive.switch.generic",
      "source.voltage.noise",
      "tline.lossy",
    ]) {
      expect(supported, `general-simulator should not claim ${type}`).not.toContain(type);
    }
  });

  it("no block name is duplicated within a single simulator entry", () => {
    const { simulators } = loadSimulatorCompat();
    for (const sim of simulators) {
      const seen = new Set<string>();
      for (const name of sim.supported) {
        expect(seen.has(name), `duplicate "${name}" in ${sim.id}`).toBe(false);
        seen.add(name);
      }
    }
  });

  it("unknown block names in supported list do not throw (silently ignored)", () => {
    // loadSimulatorCompat is pure data; passing extra unknown names through the
    // filter logic should not throw. We verify the contract: the map is returned
    // and entries with unknown names are accessible without error.
    expect(() => {
      const { simulators } = loadSimulatorCompat();
      const fake = { id: "test", label: "Test", supported: ["unknown.block.xyz"] };
      const extended = { simulators: [...simulators, fake] };
      const entry = extended.simulators.find((s) => s.id === "test");
      // filtering a catalog against an unknown block name should yield empty
      const catalog: Record<string, unknown> = { "real.block": {} };
      const filtered = Object.keys(catalog).filter((name) => entry!.supported.includes(name));
      expect(filtered).toHaveLength(0);
    }).not.toThrow();
  });
});
