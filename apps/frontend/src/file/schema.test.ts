/**
 * Tests for the precompiled JSON Schema validators.
 *
 * These schemas used to be compiled by Ajv at module-import time, which builds
 * validators with runtime code generation and so blanked the VS Code webview
 * under its CSP. `scripts/gen-validators.mjs` now compiles them ahead of time
 * into checked-in ES modules.
 *
 * The load-bearing property is therefore not "a validator exists" but
 * "the *committed* validator still decides exactly what a freshly compiled one
 * would". A stale or subtly mis-generated file would otherwise pass every
 * other test in the suite while silently accepting bad documents, so the
 * parity tests below compile the same schemas with Ajv at test time and
 * compare verdicts *and* error objects.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import blockMetadataSchema from "../../../../packages/schemas/definitions/blocks/block-metadata.schema.json";
import gsimSchema from "../../../../packages/schemas/definitions/model/gsim_sch.schema.json";
import portKindSchema from "../../../../packages/schemas/definitions/model/port-kind.schema.json";
import { validateBlockMetadataSchema } from "../generated/validators/block-metadata.js";
import { validateGsimSchDocument } from "../generated/validators/gsim-sch.js";
import catalogManifest from "../library/engine-catalog.json";
import { validateModelDocument } from "./schema";

const PORT_KIND_ID = "https://general-simulator.dev/schemas/model/port-kind.schema.json";

// Options must match the ones gen-validators.mjs compiles with, or "parity"
// would be measuring the wrong thing.
function compileGsimAtRuntime() {
  return new Ajv2020({ allErrors: true, strict: true }).compile(gsimSchema);
}

function compileBlockMetadataAtRuntime() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(portKindSchema, PORT_KIND_ID);
  return ajv.compile(blockMetadataSchema);
}

// Vitest runs with apps/frontend as the working directory; `import.meta.url`
// is a served URL under Vite's transform, not a usable filesystem path.
const FRONTEND_ROOT = process.cwd();

function readRepoFile(pathFromFrontendRoot: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, pathFromFrontendRoot), "utf8");
}

function readFixture(pathFromFrontendRoot: string): unknown {
  return JSON.parse(readRepoFile(pathFromFrontendRoot));
}

const COMPREHENSIVE = "../../tests/fixtures/gsim_sch/comprehensive.gsim_sch";

function minimalDocument() {
  return {
    schema_version: 2,
    model: {
      id: "m1",
      name: "Minimal",
      grid: 10,
      params: [],
      blocks: [],
      wires: [],
      lines: [],
      nets: [],
      simulation: {},
    },
  };
}

describe("precompiled gsim_sch validator", () => {
  it("accepts the canonical comprehensive fixture", () => {
    expect(validateGsimSchDocument(readFixture(COMPREHENSIVE))).toBe(true);
  });

  it("rejects a document with the wrong schema_version and says which field is wrong", () => {
    const doc = { ...minimalDocument(), schema_version: 3 };
    expect(validateGsimSchDocument(doc)).toBe(false);
    expect(validateGsimSchDocument.errors?.[0]?.instancePath).toBe("/schema_version");
  });

  it("rejects a document missing the model entirely", () => {
    expect(validateGsimSchDocument({ schema_version: 2 })).toBe(false);
    expect(validateGsimSchDocument.errors?.[0]?.params).toMatchObject({
      missingProperty: "model",
    });
  });

  it("rejects a block whose position is not an integer pair", () => {
    const doc = minimalDocument();
    doc.model.blocks = [
      {
        id: "b1",
        type: "control.gain",
        paradigm: "signal-flow",
        domain: "signal",
        fidelity: "ideal",
        position: ["nope", 0],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      },
    ] as never;
    expect(validateGsimSchDocument(doc)).toBe(false);
  });

  it("rejects non-objects", () => {
    for (const value of [null, 42, "x", []]) {
      expect(validateGsimSchDocument(value)).toBe(false);
    }
  });

  it("decides identically to a validator Ajv compiles at runtime, errors included", () => {
    const runtime = compileGsimAtRuntime();
    const cases: unknown[] = [
      readFixture(COMPREHENSIVE),
      minimalDocument(),
      { schema_version: 2 },
      { schema_version: 99, model: {} },
      { ...minimalDocument(), extra: true },
      null,
      [],
      "not a document",
    ];

    for (const value of cases) {
      const precompiled = validateGsimSchDocument(value);
      const precompiledErrors = JSON.stringify(validateGsimSchDocument.errors ?? null);
      expect(precompiled).toBe(runtime(value));
      expect(precompiledErrors).toBe(JSON.stringify(runtime.errors ?? null));
    }
  });
});

describe("validateModelDocument", () => {
  it("returns the document when it validates", () => {
    const doc = readFixture(COMPREHENSIVE);
    expect(validateModelDocument(doc)).toBe(doc);
  });

  it("throws with the JSON pointer of the first offending field", () => {
    expect(() => validateModelDocument({ ...minimalDocument(), schema_version: 3 })).toThrow(
      /^\/schema_version: /,
    );
  });

  it("reports the root pointer when the failure has no instance path", () => {
    expect(() => validateModelDocument({ schema_version: 2 })).toThrow(/^\/: /);
  });
});

describe("precompiled block-metadata validator", () => {
  it("accepts every entry in the shipped catalog manifest", () => {
    const entries = catalogManifest as Array<{ metadata?: unknown }>;
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const metadata = "metadata" in entry ? entry.metadata : entry;
      expect(validateBlockMetadataSchema(metadata)).toBe(true);
    }
  });

  it("resolves the $ref into port-kind.schema.json rather than ignoring it", () => {
    // A bad port-kind domain must be caught; if the referenced schema had been
    // dropped during precompilation this would wrongly pass.
    const entries = catalogManifest as Array<{ metadata?: Record<string, unknown> }>;
    const first = entries[0];
    const source = (first && "metadata" in first ? first.metadata : first) as Record<
      string,
      unknown
    >;
    const broken = structuredClone(source);
    broken.domain = "not-a-real-domain";
    expect(validateBlockMetadataSchema(broken)).toBe(false);
  });

  it("rejects metadata missing its required fields", () => {
    expect(validateBlockMetadataSchema({})).toBe(false);
    expect(validateBlockMetadataSchema.errors?.[0]?.keyword).toBe("required");
  });

  it("decides identically to a validator Ajv compiles at runtime, over the whole catalog", () => {
    const runtime = compileBlockMetadataAtRuntime();
    const entries = catalogManifest as Array<{ metadata?: unknown }>;

    for (const entry of entries) {
      const metadata = "metadata" in entry ? entry.metadata : entry;
      const precompiled = validateBlockMetadataSchema(metadata);
      const precompiledErrors = JSON.stringify(validateBlockMetadataSchema.errors ?? null);
      expect(precompiled).toBe(runtime(metadata));
      expect(precompiledErrors).toBe(JSON.stringify(runtime.errors ?? null));
    }
  });
});

describe("the generated validator modules themselves", () => {
  it("contain no runtime code generation, which is the reason they are generated", () => {
    for (const name of ["gsim-sch.js", "block-metadata.js"]) {
      const source = readRepoFile(`src/generated/validators/${name}`);
      expect(source).not.toMatch(/\bnew Function\b/);
      expect(source).not.toMatch(/\beval\s*\(/);
      // CommonJS `require` would not survive as an ES module in the webview.
      expect(source).not.toMatch(/\brequire\s*\(/);
    }
  });
});
