/**
 * FE-04: Library store tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "./library";

beforeEach(() => {
  useLibraryStore.setState({ catalog: {}, recentlyUsed: [] });
});

describe("FE-04: Library store", () => {
  it("catalog is populated after setCatalog", () => {
    useLibraryStore.getState().setCatalog({
      "signal.step": {
        id: "signal.step",
        name: "Step",
        category: "signal",
        ports: [],
        params: [],
      } as unknown as import("../model/types").BlockMetadata,
    });
    expect(useLibraryStore.getState().catalog["signal.step"]).toBeDefined();
  });

  it("recordRecentlyUsed: block moves to front of recency list", () => {
    useLibraryStore.getState().markRecentlyUsed("control.gain");
    useLibraryStore.getState().markRecentlyUsed("signal.step");
    expect(useLibraryStore.getState().recentlyUsed[0]).toBe("signal.step");
  });

  it("recency queue evicts oldest when capacity is reached", () => {
    for (let i = 0; i < 13; i++) {
      useLibraryStore.getState().markRecentlyUsed(`block.${i}`);
    }
    expect(useLibraryStore.getState().recentlyUsed.length).toBeLessThanOrEqual(12);
  });

  it("recordRecentlyUsed: no duplicates in list", () => {
    useLibraryStore.getState().markRecentlyUsed("control.gain");
    useLibraryStore.getState().markRecentlyUsed("control.gain");
    const list = useLibraryStore.getState().recentlyUsed;
    expect(list.filter((x) => x === "control.gain")).toHaveLength(1);
  });
});
