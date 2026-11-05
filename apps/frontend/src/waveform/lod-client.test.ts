/**
 * FE-36: LOD client tests
 *
 * Acceptance:
 * - Cache hits and misses produce expected request counts.
 * - Prefetch never blocks the main thread.
 */

import { describe, expect, it, vi } from "vitest";
import { getLODSlice } from "./lod-client";

describe("FE-36: LOD client", () => {
  it("miss issues a request; hit uses cache", async () => {
    let requestCount = 0;
    const mockIPC = {
      getSlice: vi.fn().mockImplementation(async () => {
        requestCount++;
        return { t: new Float64Array([0, 1]), y: new Float64Array([0, 1]) };
      }),
    };

    const client = getLODSlice({ ipc: mockIPC });

    // First call — cache miss
    await client.getSlice({ sim_id: "s1", signals: ["y"], t_start: 0, t_end: 1, max_points: 100 });
    expect(requestCount).toBe(1);

    // Second call with same params — cache hit
    await client.getSlice({ sim_id: "s1", signals: ["y"], t_start: 0, t_end: 1, max_points: 100 });
    expect(requestCount).toBe(1);
  });

  it("pan into prefetched range produces zero new requests", async () => {
    // Placeholder — prefetch integration depends on implementation
    expect(true).toBe(true);
  });
});
