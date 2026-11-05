/**
 * FE-01: port-kind.schema.json tests
 *
 * Acceptance bullets verified:
 * - Every domain (signal, electrical, thermal, mechanical, event) validates.
 * - Signal dims variants: scalar, vector{n}, matrix.
 * - Invalid cases: unknown domain, signal without dims, extra property.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, "../../packages/schemas/definitions");

describe("FE-01: port-kind.schema.json", () => {
  let validate: Ajv["validate"] | null = null;
  let schemaLoadError: string | null = null;

  beforeAll(() => {
    try {
      const raw = readFileSync(resolve(SCHEMAS_DIR, "model/port-kind.schema.json"), "utf-8");
      const schema = JSON.parse(raw);
      const ajv = new Ajv({ strict: true, allErrors: true });
      validate = ajv.compile(schema);
    } catch (e) {
      schemaLoadError = String(e);
    }
  });

  it("port-kind.schema.json loads and compiles", () => {
    expect(schemaLoadError, String(schemaLoadError)).toBeNull();
    expect(validate).not.toBeNull();
  });

  describe("valid — every domain", () => {
    const cases: [string, unknown][] = [
      ["signal scalar", { domain: "signal", dims: "scalar" }],
      ["signal matrix", { domain: "signal", dims: "matrix" }],
      ["signal vector{3}", { domain: "signal", dims: { vector: 3 } }],
      ["signal vector{1}", { domain: "signal", dims: { vector: 1 } }],
      ["electrical", { domain: "electrical" }],
      ["thermal", { domain: "thermal" }],
      ["mechanical", { domain: "mechanical" }],
      ["event", { domain: "event" }],
    ];
    for (const [name, fixture] of cases) {
      it(name, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok, `Errors: ${JSON.stringify(validate.errors)}`).toBe(true);
      });
    }
  });

  describe("invalid — must fail", () => {
    const cases: [string, unknown][] = [
      ["unknown domain", { domain: "optical" }],
      ["signal without dims", { domain: "signal" }],
      ["signal vector{0} (below minimum 1)", { domain: "signal", dims: { vector: 0 } }],
      ["extra property on electrical", { domain: "electrical", extra: true }],
      ["empty object", {}],
      ["missing domain", { dims: "scalar" }],
    ];
    for (const [name, fixture] of cases) {
      it(name, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok).toBe(false);
        expect((validate.errors ?? []).length).toBeGreaterThan(0);
      });
    }
  });
});
