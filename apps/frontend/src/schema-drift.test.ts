import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The schema is the source of truth; the generated types must follow it.
 *
 * `packages/schemas/scripts/codegen.mjs` does not actually generate from the
 * schema — it writes a hardcoded template and only parses the schema files
 * to check they are valid JSON. So the two drift silently, and did: the
 * schema listed `list` among the parameter types and the catalog used it for
 * every scripted block, while the generated union omitted it. The type
 * system therefore said a `list` parameter could not exist, which is why one
 * went without an editor and fell through to a plain string field.
 *
 * It drifted the other way too. `VariadicOutputs` and `BlockPort.domain_from`
 * had been hand-added to the generated *output*, never to the template, so
 * running the generator deleted them — both in use.
 *
 * These tests compare the two mechanically. If someone adds a value to the
 * schema, this fails until the template follows.
 */

const ROOT = path.resolve(__dirname, "../../..");
const SCHEMA = path.join(ROOT, "packages/schemas/definitions/blocks/block-metadata.schema.json");
const PORT_KIND = path.join(ROOT, "packages/schemas/definitions/model/port-kind.schema.json");
const GENERATED = path.join(ROOT, "packages/schemas/generated/typescript/index.ts");

const generated = readFileSync(GENERATED, "utf8");

/** Every `enum` list under a property of this name, anywhere in the schema. */
function enumsFor(schemaPath: string, property: string): string[][] {
  const found: string[][] = [];
  const walk = (node: unknown, key?: string) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (key === property && Array.isArray(record.enum)) {
      found.push(record.enum as string[]);
    }
    for (const [childKey, child] of Object.entries(record)) walk(child, childKey);
  };
  walk(JSON.parse(readFileSync(schemaPath, "utf8")));
  return found;
}

describe("generated types follow the schema", () => {
  it("covers every parameter type the schema allows", () => {
    const declared = new Set(enumsFor(SCHEMA, "type").flat());
    // The parameter-type enum is the one containing "vector".
    const paramTypes = [...declared].filter((value) =>
      ["number", "integer", "vector", "matrix", "string", "bool", "enum", "list"].includes(value),
    );
    expect(paramTypes.length).toBeGreaterThan(5);

    for (const type of paramTypes) {
      expect(
        generated,
        `the schema allows a "${type}" parameter; the generated union omits it`,
      ).toContain(`"${type}"`);
    }
  });

  it("covers every port-kind domain the schema allows", () => {
    const domains = enumsFor(PORT_KIND, "domain").flat();
    expect(domains.length).toBeGreaterThan(5);
    for (const domain of domains) {
      expect(
        generated,
        `the schema allows the "${domain}" domain; the generated union omits it`,
      ).toContain(`"${domain}"`);
    }
  });

  /** Both were hand-added to the output and lost on the first regeneration. */
  it("keeps the types that regenerating once deleted", () => {
    expect(generated).toContain("VariadicOutputs");
    expect(generated).toContain("domain_from");
  });
});
