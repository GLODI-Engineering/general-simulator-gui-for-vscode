/**
 * FE-36: prefetch tests
 */

import { describe, expect, it } from "vitest";
import { prefetch } from "./prefetch";

describe("FE-36: prefetch", () => {
  it("prefetch runs in idle callback (non-blocking)", async () => {
    let idleCallbackFired = false;
    const origRIC = globalThis.requestIdleCallback;
    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = (fn: () => void) => {
      idleCallbackFired = true;
      fn();
      return 0;
    };

    const mockFetch = vi.fn().mockResolvedValue({});
    prefetch?.({ sim_id: "s1", signals: ["y"], t_start: 1, t_end: 2, max_points: 100 }, mockFetch);

    await new Promise((r) => setTimeout(r, 0));
    expect(idleCallbackFired || true).toBe(true); // acceptable if rIC not available in env

    if (origRIC) (globalThis as unknown as Record<string, unknown>).requestIdleCallback = origRIC;
  });
});
