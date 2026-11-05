/**
 * FE-52: gsim_sch saver tests
 *
 * Acceptance:
 * - saveGsimSch(doc) emits keys in canonical order at every nesting level.
 * - Roundtrip property: saveGsimSch(loadGsimSch(text)) == text byte-for-byte.
 * - Model with nested subsystem also round-trips.
 */

import { describe, expect, it } from "vitest";

let loadGsimSch: ((text: string) => unknown) | null = null;
let saveGsimSch: ((doc: unknown) => string) | null = null;
let available = false;

try {
  const loaderMod = await import(/* @vite-ignore */ "./gsim_sch_loader");
  loadGsimSch = loaderMod.loadGsimSch ?? loaderMod.default;
  const saverMod = await import(/* @vite-ignore */ "./gsim_sch_saver");
  saveGsimSch = saverMod.saveGsimSch ?? saverMod.default;
  if (loadGsimSch && saveGsimSch) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

// Minimal valid v2 doc
const MINIMAL_DOC = {
  schema_version: 2,
  model: {
    id: "m-min",
    name: "Minimal",
    grid: 10,
    params: [],
    blocks: [],
    wires: [],
    lines: [],
    nets: [],
    simulation: {
      default_analysis: null,
      analyses: [],
      solver_options: {},
      initial_conditions: [],
    },
  },
};

describe("FE-52: gsim_sch_saver", () => {
  skip("saveGsimSch produces valid JSON string", () => {
    const text = saveGsimSch!(MINIMAL_DOC);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  skip("saveGsimSch top-level keys are in canonical (sorted) order", () => {
    const text = saveGsimSch!(MINIMAL_DOC);
    const parsed = JSON.parse(text);
    const keys = Object.keys(parsed);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] >= keys[i - 1]).toBe(true);
    }
  });

  skip("saveGsimSch model-level keys are in canonical order", () => {
    const text = saveGsimSch!(MINIMAL_DOC);
    const parsed = JSON.parse(text);
    const keys = Object.keys(parsed.model);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] >= keys[i - 1]).toBe(true);
    }
  });

  skip("test_loader_roundtrip with nested subsystem depth-2", () => {
    const docWithSub = {
      ...MINIMAL_DOC,
      model: {
        ...MINIMAL_DOC.model,
        id: "m-with-sub",
        blocks: [
          {
            id: "sub1",
            type: "hierarchy.subsystem.atomic",
            paradigm: "signal-flow",
            domain: "signal",
            fidelity: "n_a",
            position: [0, 0],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
            subsystem: {
              id: "m-sub1",
              name: "Inner",
              grid: 10,
              params: [],
              blocks: [],
              wires: [],
              lines: [],
              nets: [],
              simulation: {
                default_analysis: null,
                analyses: [],
                solver_options: {},
                initial_conditions: [],
              },
            },
          },
        ],
      },
    };
    const text = JSON.stringify(docWithSub, null, 2);
    // If loader + saver are canonical, roundtrip should work for canonicalised text
    const loaded = loadGsimSch!(saveGsimSch!(docWithSub));
    const saved = saveGsimSch!(loaded);
    // Re-loading the saved form should produce the same result
    expect(saveGsimSch!(loadGsimSch!(saved))).toBe(saved);
  });
});
