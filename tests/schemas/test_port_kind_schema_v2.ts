/**
 * FE-51: port-kind.schema.json v2 tests
 *
 * Tests packages/schemas/definitions/model/port-kind.schema.json after the
 * v2 extension that adds signal-bus, function-call, all physical-* kinds,
 * mixed, and the three reserved.* kinds.
 *
 * Acceptance bullets verified:
 *   ✓ all new kinds are accepted (signal, signal-bus, function-call,
 *     physical-electrical, physical-translational, physical-rotational,
 *     physical-thermal, physical-signal, mixed,
 *     reserved.physical-magnetic, reserved.physical-hydraulic,
 *     reserved.physical-fluid)
 *   ✓ an unknown kind is rejected
 *
 * The v2 port-kind schema validates objects with shape { domain: "<kind>" }.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, "../../packages/schemas/definitions");

describe("FE-51: port-kind.schema.json v2", () => {
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

  it("schema uses JSON Schema 2020-12", () => {
    const raw = JSON.parse(
      readFileSync(resolve(SCHEMAS_DIR, "model/port-kind.schema.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(raw.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("schema has additionalProperties:false", () => {
    const raw = JSON.parse(
      readFileSync(resolve(SCHEMAS_DIR, "model/port-kind.schema.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(raw.additionalProperties).toBe(false);
  });

  it("domain enum contains exactly 12 v2 kinds", () => {
    const raw = JSON.parse(
      readFileSync(resolve(SCHEMAS_DIR, "model/port-kind.schema.json"), "utf-8"),
    ) as Record<string, unknown>;
    const props = raw.properties as Record<string, unknown>;
    const domainProp = props.domain as Record<string, unknown>;
    const enumValues: string[] = domainProp.enum as string[];
    expect(enumValues).toHaveLength(12);
    expect(enumValues).toEqual(
      expect.arrayContaining([
        "signal",
        "signal-bus",
        "function-call",
        "physical-electrical",
        "physical-translational",
        "physical-rotational",
        "physical-thermal",
        "physical-signal",
        "mixed",
        "reserved.physical-magnetic",
        "reserved.physical-hydraulic",
        "reserved.physical-fluid",
      ]),
    );
  });

  // ── All 12 v2 kinds are individually accepted ──────────────────────────

  describe("valid — all v2 kinds are accepted", () => {
    const ALL_V2_KINDS: [string, string][] = [
      // causal signal kinds
      ["signal (scalar causal)", "signal"],
      ["signal-bus (bundled named signals)", "signal-bus"],
      ["function-call (event trigger)", "function-call"],
      // acausal physical network kinds
      ["physical-electrical (V/I conserving)", "physical-electrical"],
      ["physical-translational (F/v conserving)", "physical-translational"],
      ["physical-rotational (τ/ω conserving)", "physical-rotational"],
      ["physical-thermal (Q/T conserving)", "physical-thermal"],
      // bridge kind
      ["physical-signal (sensor/actuator bridge)", "physical-signal"],
      // composite
      ["mixed (subsystem with heterogeneous ports)", "mixed"],
      // reserved v3 kinds (schema-reserved; accepted by port-kind schema)
      ["reserved.physical-magnetic (v3 reserved)", "reserved.physical-magnetic"],
      ["reserved.physical-hydraulic (v3 reserved)", "reserved.physical-hydraulic"],
      ["reserved.physical-fluid (v3 reserved)", "reserved.physical-fluid"],
    ];

    for (const [label, kind] of ALL_V2_KINDS) {
      it(label, () => {
        if (!validate) return;
        const ok = validate({ domain: kind });
        expect(ok, `Expected valid; errors: ${JSON.stringify(validate.errors)}`).toBe(true);
      });
    }
  });

  // ── Unknown and removed kinds are rejected ─────────────────────────────

  describe("invalid — unknown or removed kinds are rejected", () => {
    const UNKNOWN_KINDS: [string, unknown][] = [
      // completely unknown strings
      ["unknown kind 'optical'", { domain: "optical" }],
      ["unknown kind 'rf'", { domain: "rf" }],
      ["unknown kind 'digital'", { domain: "digital" }],
      ["empty string domain", { domain: "" }],
      // v1 names that are NOT in v2 (renamed or removed)
      ["v1 'electrical' (renamed to physical-electrical in v2)", { domain: "electrical" }],
      ["v1 'thermal' (renamed to physical-thermal in v2)", { domain: "thermal" }],
      ["v1 'mechanical' (renamed to physical-translational in v2)", { domain: "mechanical" }],
      ["v1 'event' (renamed to function-call in v2)", { domain: "event" }],
      // structural errors
      ["empty object (no domain field)", {}],
      ["domain is a number (not a string)", { domain: 42 }],
      ["domain is null", { domain: null }],
      // unknown reserved. prefix variant
      ["unknown reserved kind 'reserved.optical'", { domain: "reserved.optical" }],
      // extra property on a valid kind
      [
        "extra property on a valid kind (additionalProperties:false)",
        { domain: "signal", extra: true },
      ],
    ];

    for (const [label, fixture] of UNKNOWN_KINDS) {
      it(label, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok, `Expected rejection but schema accepted: ${JSON.stringify(fixture)}`).toBe(
          false,
        );
        expect(
          (validate.errors ?? []).length,
          "Expected at least one validation error",
        ).toBeGreaterThan(0);
      });
    }
  });

  // ── Domain field is required ───────────────────────────────────────────

  it("object without domain field is rejected", () => {
    if (!validate) return;
    const ok = validate({});
    expect(ok).toBe(false);
    const errors = validate.errors ?? [];
    const missingDomain = errors.some(
      (e) =>
        e.keyword === "required" &&
        (e.params as Record<string, unknown>).missingProperty === "domain",
    );
    expect(
      missingDomain,
      `Expected 'required' error for 'domain'; got: ${JSON.stringify(errors)}`,
    ).toBe(true);
  });

  // ── Spot-checks: each "family" has at least one member in the enum ──────

  it("all acausal physical kinds are accepted", () => {
    if (!validate) return;
    const physicalKinds = [
      "physical-electrical",
      "physical-translational",
      "physical-rotational",
      "physical-thermal",
    ];
    for (const kind of physicalKinds) {
      const ok = validate({ domain: kind });
      expect(ok, `Kind "${kind}" should be valid but was rejected`).toBe(true);
    }
  });

  it("all reserved.* kinds are accepted", () => {
    if (!validate) return;
    const reservedKinds = [
      "reserved.physical-magnetic",
      "reserved.physical-hydraulic",
      "reserved.physical-fluid",
    ];
    for (const kind of reservedKinds) {
      const ok = validate({ domain: kind });
      expect(ok, `Kind "${kind}" should be valid but was rejected`).toBe(true);
    }
  });
});
