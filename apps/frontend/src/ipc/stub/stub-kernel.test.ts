/**
 * FE-32: Stub kernel tests
 *
 * Acceptance:
 * - Stub execute returns deterministic result for given input.
 * - Status transitions emit expected events.
 */

import { describe, expect, it, vi } from "vitest";
import { createStubKernel } from "./stub-kernel";

describe("FE-32: stub kernel", () => {
  it("execute returns a manifest with sim_id", async () => {
    const kernel = createStubKernel();
    const result = await kernel.execute({ type: "simulate", model: {} });
    expect(result).toHaveProperty("manifest");
    expect(result.manifest).toHaveProperty("sim_id");
  });

  it("execute produces deterministic result for same input", async () => {
    const kernel = createStubKernel();
    const input = { type: "simulate", model: { id: "m1" } };
    const r1 = await kernel.execute(input);
    const r2 = await kernel.execute(input);
    expect(JSON.stringify(r1.manifest)).toBe(JSON.stringify(r2.manifest));
  });

  it("status transitions from idle to busy to idle", async () => {
    vi.useFakeTimers();
    const kernel = createStubKernel();
    const events: string[] = [];
    kernel.on?.("kernel_status", (s: string) => events.push(s));

    const promise = kernel.execute({});
    await vi.runAllTimersAsync();
    await promise;

    expect(events).toContain("busy");
    expect(events).toContain("idle");
    vi.useRealTimers();
  });
});
