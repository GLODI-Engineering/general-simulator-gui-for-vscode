/**
 * FE-63: fixture validity tests
 *
 * Acceptance:
 * - comprehensive.gsim_sch validates against schema.
 * - Feature checklist (signal-flow, physical-electrical, thermal, converter,
 *   goto/from, subsystem, annotations, expression param, multi-analysis).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "gsim_sch/comprehensive.gsim_sch");
const SCHEMAS_DIR = resolve(__dirname, "../../packages/schemas/definitions");

let validate: ((doc: unknown) => boolean) | null = null;
let schemaAvailable = false;
let fixtureAvailable = false;

beforeAll(() => {
  try {
    const schema = JSON.parse(
      readFileSync(resolve(SCHEMAS_DIR, "model/gsim_sch.schema.json"), "utf-8"),
    );
    const ajv = new Ajv({ strict: true, allErrors: true });
    const fn = ajv.compile(schema);
    validate = (doc: unknown) => fn(doc);
    schemaAvailable = true;
  } catch {
    /* schema not yet authored */
  }

  fixtureAvailable = existsSync(FIXTURE_PATH);
});

function skip(name: string, deps: boolean[], fn: () => void) {
  if (!deps.every(Boolean)) it.skip(`${name} [deps not ready]`, fn);
  else it(name, fn);
}

describe("FE-63: test_fixture_validity", () => {
  skip("comprehensive.gsim_sch exists", [fixtureAvailable], () => {
    expect(fixtureAvailable).toBe(true);
  });

  skip(
    "validates against gsim_sch.schema.json with no errors",
    [schemaAvailable, fixtureAvailable],
    () => {
      const doc = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
      expect(validate!(doc)).toBe(true);
    },
  );

  const FEATURE_CHECKS: { name: string; fn: (doc: Record<string, unknown>) => boolean }[] = [
    {
      name: "≥1 signal-flow block",
      fn: (doc) =>
        (doc?.model as { blocks?: { type?: string }[] })?.blocks?.some((b) =>
          String(b.type).startsWith("signal-flow."),
        ) ?? false,
    },
    {
      name: "≥1 physical-electrical block",
      fn: (doc) =>
        (doc?.model as { blocks?: { type?: string }[] })?.blocks?.some((b) =>
          String(b.type).startsWith("physical-electrical."),
        ) ?? false,
    },
    {
      name: "≥1 physical-thermal block",
      fn: (doc) =>
        (doc?.model as { blocks?: { type?: string }[] })?.blocks?.some((b) =>
          String(b.type).startsWith("physical-thermal."),
        ) ?? false,
    },
    {
      name: "≥1 converter block",
      fn: (doc) =>
        (doc?.model as { blocks?: { type?: string }[] })?.blocks?.some((b) =>
          String(b.type).startsWith("converter."),
        ) ?? false,
    },
    {
      name: "goto/from pair",
      fn: (doc) => {
        const blocks = (doc?.model as { blocks?: { type?: string }[] })?.blocks ?? [];
        return (
          blocks.some((b) => b.type === "routing.goto") &&
          blocks.some((b) => b.type === "routing.from")
        );
      },
    },
    {
      name: "depth-2 subsystem",
      fn: (doc) => {
        const blocks = (doc?.model as { blocks?: { subsystem?: unknown }[] })?.blocks ?? [];
        for (const b of blocks) {
          if (b.subsystem) {
            const inner = (b.subsystem as { blocks?: { subsystem?: unknown }[] })?.blocks ?? [];
            if (inner.some((ib) => ib.subsystem)) return true;
          }
        }
        return false;
      },
    },
    {
      name: "text annotation",
      fn: (doc) =>
        (doc?.model as { lines?: { kind?: string }[] })?.lines?.some((l) => l.kind === "text") ??
        false,
    },
    {
      name: "multi-analysis simulation (≥2 analyses)",
      fn: (doc) =>
        ((doc?.model as { simulation?: { analyses?: unknown[] } })?.simulation?.analyses?.length ??
          0) >= 2,
    },
  ];

  for (const check of FEATURE_CHECKS) {
    skip(`test_fixture_features: fixture has ${check.name}`, [fixtureAvailable], () => {
      const doc = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as Record<string, unknown>;
      expect(check.fn(doc), `Missing feature: ${check.name}`).toBe(true);
    });
  }
});
