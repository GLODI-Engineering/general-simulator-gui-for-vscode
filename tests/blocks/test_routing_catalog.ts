/**
 * FE-64: routing block catalog tests
 *
 * Acceptance:
 * - Every type listed in spec §15.7 has a metadata.yaml.
 * - mux/demux/bus/selector/merge/switch/data_store types are present.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOCKS_DIR = resolve(__dirname, "../../packages/blocks/src/blocks");

const ROUTING_TYPES = [
  "routing.mux",
  "routing.demux",
  "routing.bus_creator",
  "routing.bus_selector",
  "routing.bus_assignment",
  "routing.selector",
  "routing.merge",
  "routing.manual_switch",
  "routing.multiport_switch",
  "routing.switch",
  "routing.data_store_memory",
  "routing.data_store_read",
  "routing.data_store_write",
];

function typeToPath(type: string): string {
  const parts = type.split(".");
  return resolve(BLOCKS_DIR, ...parts, "metadata.yaml");
}

describe("FE-64: routing catalog", () => {
  for (const type of ROUTING_TYPES) {
    it(`test_routing_catalog: ${type} has metadata.yaml`, () => {
      const path = typeToPath(type);
      expect(existsSync(path), `Missing: ${path}`).toBe(true);
    });
  }

  it("test_routing_catalog: mux has paradigm=routing and signal ports", () => {
    const path = typeToPath("routing.mux");
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/paradigm:\s*routing/);
    expect(content).toMatch(/domain:\s*signal/);
  });

  it("test_routing_catalog: bus_creator metadata exists", () => {
    const path = typeToPath("routing.bus_creator");
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/name:\s*routing\.bus_creator/);
  });
});
