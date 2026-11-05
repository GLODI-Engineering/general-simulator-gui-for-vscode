/**
 * FE-53: block-metadata v2 schema tests
 *
 * Acceptance:
 * - metadata.yaml without fidelities is rejected.
 * - FidelityEntry with unknown tier is rejected.
 * - Schema adds required fields: paradigm, domain, fidelities.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv/dist/2020";
import { beforeAll, describe, expect, it } from "vitest";

const SCHEMAS_DIR = resolve(process.cwd(), "../../packages/schemas/definitions");

describe("FE-53: block-metadata.schema.json v2", () => {
  let validate: ((doc: unknown) => boolean) | null = null;

  beforeAll(() => {
    const schema = JSON.parse(
      readFileSync(resolve(SCHEMAS_DIR, "blocks/block-metadata.schema.json"), "utf-8"),
    );
    const ajv = new Ajv({ strict: true, allErrors: true });
    const fn = ajv.compile(schema);
    validate = (doc: unknown) => fn(doc);
  });

  const VALID_RESISTOR_META = {
    type: "physical-electrical.passive.resistor",
    paradigm: "physical-network",
    domain: "physical-electrical",
    label: "Resistor",
    icon: "resistor.svg",
    fidelities: [
      {
        tier: "ideal",
        ports: [
          { id: "p", kind: "physical-electrical", direction: "inout" },
          { id: "n", kind: "physical-electrical", direction: "inout" },
        ],
        params: [{ id: "R", type: "number", default: 1000, unit: "Ω", doc: "Resistance" }],
        doc: "Ideal resistor",
      },
    ],
  };

  it("valid resistor metadata validates", () => {
    expect(validate!(VALID_RESISTOR_META)).toBe(true);
  });

  it("test_block_metadata_v2: a metadata.yaml without fidelities is rejected", () => {
    const { fidelities: _f, ...noFidelities } = VALID_RESISTOR_META;
    expect(validate!(noFidelities)).toBe(false);
  });

  it("test_block_metadata_v2: a FidelityEntry with unknown tier is rejected", () => {
    const doc = JSON.parse(JSON.stringify(VALID_RESISTOR_META));
    doc.fidelities[0].tier = "approximate";
    expect(validate!(doc)).toBe(false);
  });

  it("metadata without paradigm is rejected", () => {
    const { paradigm: _p, ...noPara } = VALID_RESISTOR_META;
    expect(validate!(noPara)).toBe(false);
  });

  it("metadata without domain is rejected", () => {
    const { domain: _d, ...noDomain } = VALID_RESISTOR_META;
    expect(validate!(noDomain)).toBe(false);
  });

  it("fidelities array can have multiple tiers", () => {
    const doc = JSON.parse(JSON.stringify(VALID_RESISTOR_META));
    doc.fidelities.push({
      tier: "behavioral",
      ports: doc.fidelities[0].ports,
      params: [
        { id: "R", type: "number", default: 1000 },
        { id: "Cp", type: "number", default: 0 },
      ],
      doc: "Behavioral resistor with parasitic",
    });
    expect(validate!(doc)).toBe(true);
  });
});
