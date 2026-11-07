import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGraphStore, useIpcStore } from "../store";
import { useToastStore } from "../store/toast";
import { hasAnythingToSimulate, triggerRun } from "./run";

/**
 * Clicking Run used to be able to do nothing visible at all — twice over.
 * The kernel-disconnected path returned bare, with its reason written only
 * to the Output panel, which need not be open; and an empty schematic was
 * never checked, so that click also did nothing, for a different reason the
 * user had no way to tell apart.
 */
beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  useIpcStore.setState({ importedNetlist: null });
});

function setBlocks(count: number) {
  const doc = useGraphStore.getState().document;
  useGraphStore.setState({
    document: {
      ...doc,
      model: {
        ...doc.model,
        blocks: Array.from({ length: count }, (_, i) => ({ id: `b${i}` })),
      },
    },
  } as never);
}

describe("hasAnythingToSimulate", () => {
  it("is false for a sheet with no blocks", () => {
    setBlocks(0);
    expect(hasAnythingToSimulate()).toBe(false);
  });

  it("is true once a component is on the sheet", () => {
    setBlocks(1);
    expect(hasAnythingToSimulate()).toBe(true);
  });
});

describe("triggerRun on an empty sheet", () => {
  it("says so instead of doing nothing", async () => {
    setBlocks(0);
    await triggerRun();
    const messages = useToastStore.getState().toasts.map((t) => t.message);
    expect(messages.some((m) => /empty/i.test(m))).toBe(true);
  });

  it("does not try to reach the kernel for an empty sheet", async () => {
    setBlocks(0);
    const spy = vi.spyOn(useIpcStore.getState(), "appendOutput");
    await triggerRun();
    // ensureKernelConnected announces itself through appendOutput; an empty
    // sheet must be refused before any of that happens.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
