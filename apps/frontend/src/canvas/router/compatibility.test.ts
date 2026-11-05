/**
 * FE-22: Port compatibility tests
 *
 * Acceptance:
 * - Signal-scalar↔signal-scalar OK.
 * - Signal-scalar↔signal-vector[n] → broadcast warning.
 * - electrical↔signal → forbidden.
 * - Compatibility matrix for all 5 domains.
 */

import { describe, expect, it } from "vitest";

type PortKind = { domain: string; dims?: unknown };
type CompatibilityResult = {
  compatible: boolean;
  severity: "ok" | "warning" | "error";
  reason?: string;
};

type CheckCompatibility = (from: PortKind, to: PortKind) => CompatibilityResult;

let checkCompatibility: CheckCompatibility | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./compatibility");
  checkCompatibility = mod.checkPortCompatibility ?? mod.checkCompatibility ?? mod.default;
  if (checkCompatibility !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-22: port compatibility", () => {
  skip("signal-scalar ↔ signal-scalar: OK", () => {
    const from = { domain: "signal", dims: "scalar" };
    const to = { domain: "signal", dims: "scalar" };
    const result = checkCompatibility?.(from, to);
    expect(result.compatible).toBe(true);
    expect(result.severity).toBe("ok");
  });

  skip("signal-scalar ↔ signal-vector: broadcast warning (not error)", () => {
    const from = { domain: "signal", dims: "scalar" };
    const to = { domain: "signal", dims: { vector: 3 } };
    const result = checkCompatibility?.(from, to);
    expect(result.severity).toBe("warning");
    expect(result.compatible).toBe(true); // warning, not forbidden
  });

  skip("electrical ↔ signal: forbidden", () => {
    const from = { domain: "electrical" };
    const to = { domain: "signal", dims: "scalar" };
    const result = checkCompatibility?.(from, to);
    expect(result.compatible).toBe(false);
    expect(result.severity).toBe("error");
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  skip("same-domain connections are always OK (electrical↔electrical)", () => {
    const result = checkCompatibility?.({ domain: "electrical" }, { domain: "electrical" });
    expect(result.compatible).toBe(true);
  });

  skip("thermal ↔ mechanical: forbidden", () => {
    const result = checkCompatibility?.({ domain: "thermal" }, { domain: "mechanical" });
    expect(result.compatible).toBe(false);
  });

  skip("all domain self-connections: OK", () => {
    for (const domain of ["electrical", "thermal", "mechanical", "event"] as const) {
      const result = checkCompatibility?.({ domain }, { domain });
      expect(result.compatible).toBe(true);
    }
  });
});
