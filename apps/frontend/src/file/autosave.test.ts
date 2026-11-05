/**
 * FE-29b: autosave tests
 */

import { describe, expect, it, vi } from "vitest";
import { setupAutosave } from "./autosave";

describe("FE-29b: autosave", () => {
  it("rapid edits coalesce into one flush", async () => {
    vi.useFakeTimers();
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = setupAutosave(saveFn, { debounceMs: 500 });

    // Simulate 10 rapid mutations
    for (let i = 0; i < 10; i++) {
      setupAutosave.emit?.("commit");
    }

    expect(saveFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(saveFn).toHaveBeenCalledTimes(1);

    unsubscribe?.();
    vi.useRealTimers();
  });
});
