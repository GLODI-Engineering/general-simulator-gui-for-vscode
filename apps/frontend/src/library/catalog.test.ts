/**
 * FE-23: Block catalog loader tests
 *
 * Acceptance:
 * - All 10 metadata files parse and validate against block-metadata schema.
 * - Cross-field rule tests (pass and fail paths).
 * - Catalog manifest drift test.
 * - Loader handles state_count: dynamic.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import loadCatalogImpl from "./catalog";
import { loadCatalog } from "./catalog-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../../");
const BLOCKS_DIR = resolve(REPO_ROOT, "packages/blocks/src/blocks");
const SCHEMAS_DIR = resolve(REPO_ROOT, "packages/schemas/definitions");

function loadSchema(relPath: string): object {
  return JSON.parse(readFileSync(resolve(SCHEMAS_DIR, relPath), "utf-8"));
}

function findMetadataFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        results.push(...findMetadataFiles(full));
      } else if (entry === "metadata.yaml") {
        results.push(full);
      }
    }
  } catch {
    /* dir may not exist */
  }
  return results;
}

const V1_BLOCK_NAMES = [
  "constant",
  "step",
  "gain",
  "sum",
  "integrator",
  "derivative",
  "pid",
  "transfer_function",
  "saturation",
  "scope",
];

// The YAML-metadata suite that stood here asserted that
// `packages/blocks/**/metadata.yaml` existed, parsed and validated. Those
// files were a second description of components the engine already
// describes, and they are gone -- the engine is the catalogue. What the
// remaining suites below check is the engine's own declaration, which is
// the only one left to be wrong.

describe("FE-23: block catalog loader cross-field rules", () => {
  const loadCatalog: Function = loadCatalogImpl;
  const loaderAvailable = true;

  function skip(name: string, fn: () => void) {
    if (!loaderAvailable) it.skip(`${name} [loader not yet implemented]`, fn);
    else it(name, fn);
  }

  skip("main_param must reference an existing param (fail path)", () => {
    expect(() =>
      loadCatalog?.([
        {
          name: "control.gain",
          label: "Gain",
          version: 1,
          category: "control",
          description: "test",
          ports: { inputs: [], outputs: [] },
          params: [{ name: "k", label: "K", type: "number" }],
          symbol: { bbox: [20, 10], shape: "rect" },
          behavior: {
            causality: "causal",
            domain: "signal",
            state_count: 0,
            equation_template: "control.gain",
          },
          main_param: "NONEXISTENT",
        },
      ]),
    ).toThrow(/main_param/i);
  });

  skip("valid main_param passes cross-field rule", () => {
    expect(() =>
      loadCatalog?.([
        {
          name: "control.gain",
          label: "Gain",
          version: 1,
          category: "control",
          description: "test",
          ports: { inputs: [], outputs: [] },
          params: [{ name: "k", label: "K", type: "number" }],
          symbol: { bbox: [20, 10], shape: "rect" },
          behavior: {
            causality: "causal",
            domain: "signal",
            state_count: 0,
            equation_template: "control.gain",
          },
          main_param: "k",
        },
      ]),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FE-47: source/dependent block names present in catalog manifest
//
// These three suites (FE-47/48/49) pinned one thing: the migration to an
// engine-owned catalogue did not quietly lose a block. That migration is done.
// gsim-core#59 has since removed, deliberately, every component the engine
// cannot compile -- so the lists below are no longer "what must be there", they
// are "what is there, and the prune did not touch it by accident".
//
// Seven of FE-47's 23 went: `source.voltage.{am,noise,random,rf_port}`,
// `source.current.am`, `source.behavioral` and `source.ideal_delay`. No
// `TypeSpec` emitted any of them. The 16 that remain are the ones a netlist can
// actually carry, and they are still worth pinning.
// ---------------------------------------------------------------------------

const FE47_SOURCE_NAMES = [
  "source.voltage.dc",
  "source.voltage.pulse",
  "source.voltage.sin",
  "source.voltage.exp",
  "source.voltage.pwl",
  "source.voltage.sffm",
  "source.current.dc",
  "source.current.pulse",
  "source.current.sin",
  "source.current.exp",
  "source.current.pwl",
  "source.current.sffm",
  "source.dependent.vcvs",
  "source.dependent.vccs",
  "source.dependent.cccs",
  "source.dependent.ccvs",
];

describe("FE-47: source/dependent block names in catalog manifest", () => {
  it("the engine's catalogue contains the 16 FE-47 block names that survived the prune", () => {
    const manifestPath = resolve(__dirname, "./engine-catalog.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Array<{
      metadata: { name: string };
    }>;
    const names = new Set(manifest.map((e) => e.metadata.name));
    for (const expected of FE47_SOURCE_NAMES) {
      expect(names, `Missing FE-47 block: ${expected}`).toContain(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// FE-48 (semiconductors) and FE-49 (transmission lines) stood here, each
// asserting that the catalogue carried all of its ticket's block names.
//
// Their subject is gone. gsim-core#59 removed `semi.*` and `tline.*` from the
// engine's library in full -- 15 components, none of which any `TypeSpec`
// emitted, so none of which could ever be simulated. Asserting their presence
// now would be asserting the opposite of the contract in that repository's
// `docs/decisions/0007`: a palette entry is a promise that the engine can
// compile it.
//
// The artwork for them is still drawn and still in `symbols/registry.ts`, held
// there by `registry-reaches-the-catalog.test.ts`'s allowlist with the reason,
// so the symbols are ready if a SPICE target is ever decided on.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FE-170: build-catalog-manifest.ts round-trips GSF symbol.primitives intact
// (BE-74 authored bjt_npn/mosfet_n with shape: primitives — this proves the
// build script doesn't drop or rename the new field on its way into
// catalog-manifest.json).
// ---------------------------------------------------------------------------

describe("primitive artwork survives the catalog loader", () => {
  // This used to read bjt_npn and mosfet_n out of the manifest, which were
  // the only two built-ins authored with `shape: primitives`. Their artwork
  // now lives in `canvas/nodes/symbols/` and the metadata carries none, so
  // there is no built-in example left — but the path is still live and still
  // matters: the symbol editor writes `shape: "primitives"` for every
  // component a user draws (see symbol-editor/save.ts). A fixture covers the
  // property without depending on a built-in that may be redrawn again.
  it("keeps a primitives array, with every primitive's discriminator intact", () => {
    const authored = {
      name: "user.test_widget",
      label: "Test widget",
      version: 1 as const,
      category: "user",
      description: "fixture",
      paradigm: "physical-network",
      domain: "physical-electrical",
      aliases: [],
      tags: [],
      fidelities: [{ tier: "n_a" as const, ports: [], params: [], doc: "fixture" }],
      ports: { inputs: [], outputs: [] },
      params: [],
      symbol: {
        bbox: [60, 40] as [number, number],
        shape: "primitives" as const,
        primitives: [
          { type: "line", x1: 0, y1: 20, x2: 60, y2: 20 },
          { type: "rect", x: 10, y: 10, w: 40, h: 20 },
        ],
      },
      behavior: {
        causality: "acausal" as const,
        domain: "electrical",
        state_count: 0,
        equation_template: "user.test_widget",
      },
    };

    const loaded = loadCatalog([authored as never]);
    const entry = loaded["user.test_widget"];
    expect(entry).toBeDefined();
    const symbol = entry?.symbol as { shape: string; primitives?: Array<{ type: string }> };
    expect(symbol.shape).toBe("primitives");
    expect(symbol.primitives?.length).toBe(2);
    for (const primitive of symbol.primitives ?? []) {
      expect(typeof primitive.type).toBe("string");
    }
  });
});
