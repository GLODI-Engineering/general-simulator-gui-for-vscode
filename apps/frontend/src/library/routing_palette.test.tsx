/**
 * FE-64: routing palette panel tests
 *
 * Acceptance:
 * - Library browser shows Routing sub-group under Signal-flow.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, "./engine-catalog.json");

describe("FE-64: routing_palette", () => {
  it("renders Routing sub-group in Signal-flow (manifest entries exist)", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Array<{
      metadata: { name?: string; paradigm?: string };
    }>;
    const routing = manifest.filter((e) => e.metadata?.paradigm === "routing");
    expect(routing.length).toBeGreaterThan(0);
  });

  it("Routing sub-group includes goto/from from FE-57 plus routing blocks", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Array<{
      metadata: { name?: string };
    }>;
    const names = new Set(manifest.map((e) => e.metadata?.name).filter(Boolean));
    expect(names.has("routing.goto")).toBe(true);
    expect(names.has("routing.from")).toBe(true);
    expect(names.has("routing.mux")).toBe(true);
    expect(names.has("routing.demux")).toBe(true);
  });
});
