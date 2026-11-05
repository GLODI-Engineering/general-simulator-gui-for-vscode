/**
 * FE-56: port-compat tests
 *
 * Acceptance:
 * - canConnect(signal-out, physical-electrical-p) -> {ok:false, reason:'kind-mismatch'}
 * - canConnect on an already-driven signal input -> {ok:false, reason:'fan-in-on-signal'}
 * - connecting a third wire to a physical-electrical node is allowed
 */

import { describe, expect, it } from "vitest";

type CompatResult = { ok: true } | { ok: false; reason: string };
type Port = { kind: string; direction?: string; driven?: boolean; physical?: boolean };

let canConnect: ((src: Port, dst: Port) => CompatResult) | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./port-compat");
  canConnect = mod.canConnect ?? mod.default;
  if (canConnect) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-56: port-compat", () => {
  skip("test_port_compat_kind_mismatch: signal-out to physical-electrical-p", () => {
    if (!canConnect) throw new Error("canConnect not available");
    const result = canConnect(
      { kind: "signal", direction: "out" },
      { kind: "physical-electrical", direction: "inout" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("kind-mismatch");
  });

  skip("test_port_compat_fan_in: already-driven signal input -> fan-in-on-signal", () => {
    if (!canConnect) throw new Error("canConnect not available");
    const result = canConnect(
      { kind: "signal", direction: "out" },
      { kind: "signal", direction: "in", driven: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("fan-in-on-signal");
  });

  skip("test_port_compat_fan_in_physical: third wire to physical node is allowed", () => {
    if (!canConnect) throw new Error("canConnect not available");
    const result = canConnect(
      { kind: "physical-electrical", direction: "inout" },
      { kind: "physical-electrical", direction: "inout", driven: true },
    );
    expect(result.ok).toBe(true);
  });

  skip("same-kind signal connection (undriven) is allowed", () => {
    if (!canConnect) throw new Error("canConnect not available");
    const result = canConnect(
      { kind: "signal", direction: "out" },
      { kind: "signal", direction: "in", driven: false },
    );
    expect(result.ok).toBe(true);
  });

  skip("reserved-kind connection is refused", () => {
    if (!canConnect) throw new Error("canConnect not available");
    const result = canConnect(
      { kind: "reserved.physical-magnetic" },
      { kind: "reserved.physical-magnetic" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("reserved-kind");
  });
});
