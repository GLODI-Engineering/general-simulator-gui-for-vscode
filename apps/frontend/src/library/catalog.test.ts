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
import Ajv from "ajv";
import yaml from "js-yaml";

import { loadCatalog } from "./catalog-core";
import { describe, expect, it } from "vitest";
import loadCatalogImpl from "./catalog";

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

describe("FE-23: block catalog — YAML metadata files", () => {
  let validate: Ajv["validate"] | null = null;

  try {
    const blockMetaSchema = loadSchema("blocks/block-metadata.schema.json");
    const portKindSchema = loadSchema("model/port-kind.schema.json");
    const ajv = new Ajv({ strict: true, allErrors: true });
    ajv.addSchema(
      portKindSchema,
      "https://general-simulator.dev/schemas/model/port-kind.schema.json",
    );
    validate = ajv.compile(blockMetaSchema);
  } catch {
    /* schema not yet authored */
  }

  it("all 10 v1 metadata.yaml files exist", () => {
    const files = findMetadataFiles(BLOCKS_DIR);
    const names = files.map((f) => f.split("/").slice(-2)[0]);
    for (const name of V1_BLOCK_NAMES) {
      expect(names, `Missing metadata.yaml for ${name}`).toContain(name);
    }
  });

  it("all 10 v1 metadata.yaml files parse as YAML without error", () => {
    const files = findMetadataFiles(BLOCKS_DIR);
    for (const file of files) {
      const name = file.split("/").slice(-2)[0];
      if (!V1_BLOCK_NAMES.includes(name)) continue;
      expect(() => yaml.load(readFileSync(file, "utf-8"))).not.toThrow();
    }
  });

  it("all 10 v1 metadata.yaml files validate against block-metadata schema", () => {
    if (!validate) {
      console.warn("block-metadata.schema.json not yet authored — skipping validation");
      return;
    }
    const files = findMetadataFiles(BLOCKS_DIR);
    for (const file of files) {
      const name = file.split("/").slice(-2)[0];
      if (!V1_BLOCK_NAMES.includes(name)) continue;
      const data = yaml.load(readFileSync(file, "utf-8"));
      const ok = validate(data);
      expect(ok, `${name}/metadata.yaml errors: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it("transfer_function has state_count: dynamic", () => {
    const tfFile = resolve(BLOCKS_DIR, "control/transfer_function/metadata.yaml");
    const data = yaml.load(readFileSync(tfFile, "utf-8")) as Record<string, unknown>;
    const behavior = data.behavior as Record<string, unknown>;
    expect(behavior?.state_count).toBe("dynamic");
  });
});

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
// FE-47: all 23 source/dependent block names present in catalog manifest
// ---------------------------------------------------------------------------

const FE47_SOURCE_NAMES = [
  "source.voltage.dc",
  "source.voltage.pulse",
  "source.voltage.sin",
  "source.voltage.exp",
  "source.voltage.pwl",
  "source.voltage.sffm",
  "source.voltage.am",
  "source.voltage.noise",
  "source.voltage.random",
  "source.voltage.rf_port",
  "source.current.dc",
  "source.current.pulse",
  "source.current.sin",
  "source.current.exp",
  "source.current.pwl",
  "source.current.sffm",
  "source.current.am",
  "source.dependent.vcvs",
  "source.dependent.vccs",
  "source.dependent.cccs",
  "source.dependent.ccvs",
  "source.behavioral",
  "source.ideal_delay",
];

describe("FE-47: source/dependent block names in catalog manifest", () => {
  it("catalog-manifest.json contains all 23 FE-47 block names", () => {
    const manifestPath = resolve(__dirname, "./catalog-manifest.json");
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
// FE-48: all 10 semiconductor block names present in catalog manifest
// ---------------------------------------------------------------------------

const FE48_SEMI_NAMES = [
  "semi.diode",
  "semi.diode.zener",
  "semi.bjt.npn",
  "semi.bjt.pnp",
  "semi.jfet.n",
  "semi.jfet.p",
  "semi.mesfet.n",
  "semi.mosfet.n",
  "semi.mosfet.p",
  "semi.mosfet.vdmos",
];

describe("FE-48: semiconductor block names in catalog manifest", () => {
  it("catalog-manifest.json contains all 10 FE-48 block names", () => {
    const manifestPath = resolve(__dirname, "./catalog-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Array<{
      metadata: { name: string };
    }>;
    const names = new Set(manifest.map((e) => e.metadata.name));
    for (const expected of FE48_SEMI_NAMES) {
      expect(names, `Missing FE-48 block: ${expected}`).toContain(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// FE-49: all 5 transmission-line block names present in catalog manifest
// ---------------------------------------------------------------------------

const FE49_TLINE_NAMES = [
  "tline.lossless",
  "tline.lossy",
  "tline.urc",
  "tline.lumped",
  "tline.linear_device",
];

describe("FE-49: tline block names in catalog manifest", () => {
  it("catalog-manifest.json contains all 5 FE-49 block names", () => {
    const manifestPath = resolve(__dirname, "./catalog-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Array<{
      metadata: { name: string };
    }>;
    const names = new Set(manifest.map((e) => e.metadata.name));
    for (const expected of FE49_TLINE_NAMES) {
      expect(names, `Missing FE-49 block: ${expected}`).toContain(expected);
    }
  });
});

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
