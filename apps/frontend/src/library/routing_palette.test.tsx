/**
 * FE-64: routing palette panel tests
 *
 * Acceptance:
 * - Library browser shows Routing sub-group under Signal-flow.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, "./engine-catalog.json");

describe("FE-64: routing_palette", () => {
  it("renders Routing sub-group in Signal-flow (manifest entries exist)", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Array<{
      metadata: { name?: string; paradigm?: string };
    }>;
    const routing = manifest.filter((e) => e.metadata?.paradigm === "routing");
    expect(routing.length).toBeGreaterThan(0);
  });

  it("Routing sub-group is the goto/from pair from FE-57", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Array<{
      metadata: { name?: string; paradigm?: string };
    }>;
    const names = new Set(manifest.map((e) => e.metadata?.name).filter(Boolean));
    expect(names.has("routing.goto")).toBe(true);
    expect(names.has("routing.from")).toBe(true);

    // `routing.mux` and `routing.demux` were asserted here too. They were part of Simulink's
    // Signal Routing palette transcribed into the library, and no `TypeSpec` emitted either, so
    // gsim-core#59 removed them -- a mux *computes* an output from a select input, which is a
    // block an engine has to implement rather than connectivity the pipeline can resolve away.
    // What is left under this paradigm is exactly the universal pair, which every target must
    // support by construction (gsim-core#54).
    const routing = manifest
      .filter((e) => e.metadata?.paradigm === "routing")
      .map((e) => e.metadata?.name);
    expect([...new Set(routing)].sort()).toEqual(["routing.from", "routing.goto"]);
  });
});
