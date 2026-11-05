import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { loadGsimSch } from "./gsim_sch_loader";
import { saveGsimSch } from "./gsim_sch_saver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  __dirname,
  "../../../../tests/fixtures/gsim_sch/comprehensive.gsim_sch",
);
const SCHEMA_PATH = resolve(
  __dirname,
  "../../../../packages/schemas/definitions/model/gsim_sch.schema.json",
);

function readFixture() {
  return readFileSync(FIXTURE_PATH, "utf-8");
}

describe("FE-63: .gsim_sch roundtrip", () => {
  it("test_fixture_validity: comprehensive.gsim_sch exists and validates against schema", () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    const text = readFixture();
    const doc = JSON.parse(text);

    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);
    expect(validate(doc)).toBe(true);
  });

  it("test_roundtrip_semantic: load + save preserves document semantics", () => {
    const text = readFixture();
    const loaded = loadGsimSch(text);
    if ("error" in loaded) {
      throw new Error(`loadGsimSch failed: ${loaded.error}`);
    }
    const reparsed = JSON.parse(saveGsimSch(loaded));
    const original = JSON.parse(text);
    expect(reparsed).toEqual(original);
  });

  it("test_fixture_features: fixture contains required FE-63 features", () => {
    const doc = JSON.parse(readFixture());
    const blocks = doc?.model?.blocks ?? [];
    const lines = doc?.model?.lines ?? [];
    const analyses = doc?.model?.simulation?.analyses ?? [];

    const hasSignal = blocks.some((b: { type?: string }) => String(b.type).startsWith("signal."));
    const hasControl = blocks.some((b: { type?: string }) => String(b.type).startsWith("control."));
    const hasConverter = blocks.some((b: { type?: string }) =>
      String(b.type).startsWith("converter."),
    );
    const hasHierarchy = blocks.some((b: { type?: string }) =>
      String(b.type).startsWith("hierarchy."),
    );
    const hasGoto = blocks.some((b: { type?: string }) => b.type === "routing.goto");
    const hasFrom = blocks.some((b: { type?: string }) => b.type === "routing.from");
    const hasText = lines.some((l: { kind?: string }) => l.kind === "text");

    expect(hasSignal).toBe(true);
    expect(hasControl).toBe(true);
    expect(hasConverter).toBe(true);
    expect(hasHierarchy).toBe(true);
    expect(hasGoto && hasFrom).toBe(true);
    expect(hasText).toBe(true);
    expect(analyses.length).toBeGreaterThanOrEqual(2);
  });
});

describe("model.role (spec §4.1)", () => {
  function compileSchema() {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
    return new Ajv({ strict: false, allErrors: true }).compile(schema);
  }

  it("defaults to schematic: the fixture carries no role and none is invented on save", () => {
    const original = JSON.parse(readFixture());
    expect(original.model.role).toBeUndefined();

    const loaded = loadGsimSch(readFixture());
    if ("error" in loaded) throw new Error(`loadGsimSch failed: ${loaded.error}`);
    expect("role" in JSON.parse(saveGsimSch(loaded)).model).toBe(false);
  });

  it('round-trips role: "library" through load + save', () => {
    const doc = JSON.parse(readFixture());
    doc.model.role = "library";
    expect(compileSchema()(doc)).toBe(true);

    const loaded = loadGsimSch(JSON.stringify(doc));
    if ("error" in loaded) throw new Error(`loadGsimSch failed: ${loaded.error}`);
    expect(loaded.model.role).toBe("library");
    expect(JSON.parse(saveGsimSch(loaded)).model.role).toBe("library");
  });

  it("rejects an unknown role value", () => {
    const doc = JSON.parse(readFixture());
    doc.model.role = "gallery";
    const validate = compileSchema();

    expect(validate(doc)).toBe(false);
    expect(JSON.stringify(validate.errors)).toContain("role");
  });

  it("rejects role on a nested subsystem model", () => {
    const doc = JSON.parse(readFixture());
    const host = doc.model.blocks.find((b: { subsystem?: unknown }) => b.subsystem);
    expect(host).toBeDefined();
    host.subsystem.role = "library";

    expect(compileSchema()(doc)).toBe(false);
  });
});
