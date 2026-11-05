/**
 * Transport fallback when no extension host is present.
 *
 * The VS Code paths — `initKernelFromVsCode()`, `applyKernelConfig()`,
 * `reconnectKernel()`'s restart handshake — are covered by
 * `vscode-transport.test.ts`. What this file pins down is the other branch:
 * in the dev harness and under vitest there is no host, so `getIpcClient()`
 * must resolve against the stub kernel rather than hanging on a connection
 * that will never arrive.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("./client");
  vi.resetModules();
});

describe("transport — no extension host", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getIpcClient() serves the stub kernel instead of waiting for a host", async () => {
    const transport = await import("./transport");

    const client = transport.getIpcClient();
    const result = await client.execute({ type: "simulate" });

    // The stub kernel always resolves with a canned manifest — proving this
    // is not parked in a never-resolving wait state.
    expect(result.manifest).toBeDefined();
  });
});
