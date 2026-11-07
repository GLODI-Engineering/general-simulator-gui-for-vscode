import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

import { loadSimulatorCompat } from "./simulator-compat";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * `simulator-compat.yaml` and the inline list in `simulator-compat.ts` are the
 * same data written twice — the TS copy is what the bundle ships, the YAML is
 * what a human edits — and the YAML's own header says to keep them in sync by
 * hand. Nothing checked that they were.
 *
 * They had drifted. Four types gsim-core's compile registry can emit —
 * `control.integrator`, `control.derivative`, `control.delay` and
 * `source.voltage.sin` — were missing, so the library hid parts from the user
 * that the engine runs perfectly well. `control.integrator` in particular was
 * reported as "no compile emitter" in an earlier benchmark; it has one, and
 * this list was the reason nobody noticed.
 *
 * This is the invariant the GUI's whole relationship with the engine rests on
 * (AGENTS.md invariant 0a): what the library offers should be what the engine
 * can run.
 */
describe("simulator compatibility data", () => {
  const fromYaml = yaml.load(readFileSync(resolve(here, "./simulator-compat.yaml"), "utf-8")) as {
    simulators: Array<{ id: string; label: string; supported: string[] }>;
  };
  const fromCode = loadSimulatorCompat();

  it("declares the same simulators in both copies", () => {
    expect(fromCode.simulators.map((s) => s.id)).toEqual(fromYaml.simulators.map((s) => s.id));
  });

  for (const target of ["general-simulator"]) {
    it(`lists exactly the same supported types for ${target}`, () => {
      const inYaml = fromYaml.simulators.find((s) => s.id === target)?.supported ?? [];
      const inCode = fromCode.simulators.find((s) => s.id === target)?.supported ?? [];
      expect([...inCode].sort()).toEqual([...inYaml].sort());
    });
  }

  it("has no duplicate entries", () => {
    for (const simulator of fromCode.simulators) {
      expect(new Set(simulator.supported).size).toBe(simulator.supported.length);
    }
  });

  it("covers the engine's registry, which is the authority", () => {
    // The count is asserted rather than the registry read, because gsim-core
    // is a sibling repository that is not present in every checkout. The
    // number is the one `scripts/check-simulator-compat.mjs` verifies against
    // the real `compile/spec.rs` when it is available; if the engine gains or
    // loses a type, that script fails first and this number is updated with
    // the list.
    const supported = fromCode.simulators.find((s) => s.id === "general-simulator")?.supported;
    expect(supported?.length).toBe(59);
  });
});
