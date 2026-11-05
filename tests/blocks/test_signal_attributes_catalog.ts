/**
 * FE-66: signal-attributes catalog tests
 *
 * Acceptance:
 * - ic, signal_specification, unit_conversion, probe each have metadata.yaml on disk.
 * - signal_specification dims are enforced by propagation pass.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOCKS_DIR = resolve(__dirname, "../../packages/blocks/src/blocks");

const ATTR_TYPES = [
  "signal-flow.attributes.ic",
  "signal-flow.attributes.signal_specification",
  "signal-flow.attributes.unit_conversion",
  "signal-flow.attributes.probe",
];

function typeToPath(type: string): string {
  const parts = type.split(".");
  return resolve(BLOCKS_DIR, ...parts, "metadata.yaml");
}

describe("FE-66: signal-attributes catalog", () => {
  for (const type of ATTR_TYPES) {
    it(`test_signal_attributes_catalog: ${type} has metadata.yaml`, () => {
      const path = typeToPath(type);
      expect(existsSync(path), `Missing: ${path}`).toBe(true);
    });
  }
});
