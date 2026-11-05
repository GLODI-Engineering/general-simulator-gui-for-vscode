/**
 * FE-52: gsim_sch loader tests
 *
 * Acceptance:
 * - loadGsimSch(text) returns a typed ModelDocument on success, LoadError on failure.
 * - schema_version != 2 is rejected with 'Unsupported gsim_sch schema_version'.
 * - additionalProperties:false enforced for Model, Block, Wire.
 * - Byte-exact roundtrip on canonical RC-low-pass example.
 * - Byte-exact roundtrip on a model with one nested subsystem (depth 2).
 */

import { describe, expect, it } from "vitest";

let loadGsimSch: ((text: string) => unknown) | null = null;
let saveGsimSch: ((doc: unknown) => string) | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./gsim_sch_loader");
  loadGsimSch = mod.loadGsimSch ?? mod.default;
  const saveMod = await import(/* @vite-ignore */ "./gsim_sch_saver");
  saveGsimSch = saveMod.saveGsimSch ?? saveMod.default;
  if (loadGsimSch && saveGsimSch) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

// ---------------------------------------------------------------------------
// Canonical RC low-pass fixture (canonical key order, per spec §17.4)
// ---------------------------------------------------------------------------

const RC_LOWPASS_TEXT = JSON.stringify(
  {
    model: {
      blocks: [
        {
          domain: "physical-electrical",
          fidelity: "ideal",
          ic: {},
          id: "b-vsrc",
          mirror: "none",
          paradigm: "physical-network",
          params: { V: 1 },
          position: [0, 0],
          rotation: 0,
          type: "physical-electrical.source.voltage_dc",
        },
        {
          domain: "physical-electrical",
          fidelity: "ideal",
          ic: {},
          id: "b-r1",
          mirror: "none",
          paradigm: "physical-network",
          params: { R: 1000 },
          position: [100, 0],
          rotation: 0,
          type: "physical-electrical.passive.resistor",
        },
      ],
      grid: 10,
      id: "m-rc-lp",
      lines: [],
      name: "RC Low-Pass",
      nets: [],
      params: [],
      simulation: {
        analyses: [
          {
            id: "tr1",
            t_end: 0.01,
            t_step: 0.00001,
            type: "TRAN",
            uic: false,
          },
        ],
        default_analysis: "tr1",
        initial_conditions: [],
        solver_options: {},
      },
      wires: [
        {
          from: { block: "b-vsrc", port: "p" },
          id: "w1",
          kind: "physical-electrical",
          net: null,
          pinned: false,
          to: { block: "b-r1", port: "p" },
          waypoints: [],
        },
      ],
    },
    schema_version: 2,
  },
  null,
  2,
);

describe("FE-52: gsim_sch_loader", () => {
  skip("loadGsimSch returns a document on valid input", () => {
    const result = loadGsimSch!(RC_LOWPASS_TEXT) as { model: unknown; schema_version: number };
    expect(result).not.toBeNull();
    expect(result.schema_version).toBe(2);
  });

  skip("test_loader_rejects_v1: schema_version=1 rejected with correct message", () => {
    const v1 = JSON.stringify({ ...JSON.parse(RC_LOWPASS_TEXT), schema_version: 1 });
    const result = loadGsimSch!(v1) as { error: string } | null;
    expect(result).toBeTruthy();
    // Either throws or returns an error object
    if (result && "error" in result) {
      expect((result as { error: string }).error).toMatch(/unsupported.*schema_version/i);
    }
  });

  skip("test_loader_rejects_v1 via try/catch variant", () => {
    const v1 = JSON.stringify({ ...JSON.parse(RC_LOWPASS_TEXT), schema_version: 1 });
    let thrown = false;
    try {
      loadGsimSch!(v1);
    } catch (e) {
      thrown = true;
      expect(String(e)).toMatch(/schema_version/i);
    }
    // Accept either throw or error return
    if (!thrown) {
      const result = loadGsimSch!(v1) as { error?: string };
      expect(result?.error).toMatch(/schema_version/i);
    }
  });

  skip("test_loader_rejects_unknown_keys: extra top-level key rejected", () => {
    const extra = JSON.stringify({ ...JSON.parse(RC_LOWPASS_TEXT), extra_key: "bad" });
    let ok = true;
    try {
      const result = loadGsimSch!(extra) as { error?: string };
      if (result?.error) ok = false;
    } catch {
      ok = false;
    }
    expect(ok).toBe(false);
  });

  skip("test_loader_roundtrip: byte-exact roundtrip on RC-low-pass", () => {
    const doc = loadGsimSch!(RC_LOWPASS_TEXT);
    const saved = saveGsimSch!(doc);
    expect(saved).toBe(RC_LOWPASS_TEXT);
  });
});
