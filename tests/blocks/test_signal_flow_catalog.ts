/**
 * FE-54: signal-flow catalog tests
 *
 * Acceptance:
 * - Every type from spec §15.1 has a valid metadata.yaml on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOCKS_DIR = resolve(__dirname, "../../packages/blocks/src/blocks");

// All signal-flow types from spec §15.1
const SIGNAL_FLOW_TYPES = [
  // Sources
  "signal-flow.source.constant",
  "signal-flow.source.step",
  "signal-flow.source.ramp",
  "signal-flow.source.sine",
  "signal-flow.source.pulse",
  "signal-flow.source.from_workspace",
  "signal-flow.source.ground",
  // Math
  "signal-flow.math.gain",
  "signal-flow.math.sum",
  "signal-flow.math.product",
  "signal-flow.math.divide",
  "signal-flow.math.abs",
  "signal-flow.math.sign",
  "signal-flow.math.sqrt",
  "signal-flow.math.math_function",
  "signal-flow.math.trigonometric",
  // Continuous
  "signal-flow.continuous.integrator",
  "signal-flow.continuous.derivative",
  "signal-flow.continuous.state_space",
  "signal-flow.continuous.transfer_function",
  "signal-flow.continuous.pid",
  // Discrete
  "signal-flow.discrete.integrator",
  "signal-flow.discrete.delay",
  "signal-flow.discrete.zero_order_hold",
  "signal-flow.discrete.unit_delay",
  // Discontinuity
  "signal-flow.discontinuity.saturation",
  "signal-flow.discontinuity.dead_zone",
  "signal-flow.discontinuity.relay",
  "signal-flow.discontinuity.rate_limiter",
  // Logic
  "signal-flow.logic.and",
  "signal-flow.logic.or",
  "signal-flow.logic.not",
  "signal-flow.logic.compare",
  // Lookup
  "signal-flow.lookup.1d",
  "signal-flow.lookup.2d",
  // Sinks
  "signal-flow.sink.scope",
  "signal-flow.sink.to_workspace",
  "signal-flow.sink.terminator",
] as const;

function typeToPath(type: string): string {
  return resolve(BLOCKS_DIR, ...type.split("."), "metadata.yaml");
}

type ParsedMetadata = {
  type?: unknown;
  paradigm?: unknown;
  domain?: unknown;
  fidelities?: Array<{ tier?: unknown }>;
};

describe("FE-54: signal-flow catalog", () => {
  for (const type of SIGNAL_FLOW_TYPES) {
    it(`test_signal_flow_catalog: ${type} has a valid metadata.yaml on disk`, () => {
      const path = typeToPath(type);
      expect(existsSync(path), `Missing: ${path}`).toBe(true);

      const parsed = yaml.load(readFileSync(path, "utf-8")) as ParsedMetadata;
      expect(parsed && typeof parsed === "object", `Invalid YAML object at ${path}`).toBe(true);
      expect(parsed.type).toBe(type);
      expect(parsed.paradigm).toBe("signal-flow");
      expect(parsed.domain).toBe("signal");
      expect(parsed.fidelities?.some((entry) => entry.tier === "n_a")).toBe(true);
    });
  }
});
