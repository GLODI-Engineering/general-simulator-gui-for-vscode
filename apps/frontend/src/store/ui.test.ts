/**
 * FE-04: UI store — selection tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui";

beforeEach(() => {
  useUiStore.setState({ selection: new Set<string>() });
});

describe("FE-04: UI store — selection", () => {
  it("addToSelection: id appears in selection Set", () => {
    useUiStore.getState().addSelection("b1");
    expect(useUiStore.getState().selection.has("b1")).toBe(true);
  });

  it("addToSelection: idempotent on duplicate", () => {
    useUiStore.getState().addSelection("b1");
    useUiStore.getState().addSelection("b1");
    expect(useUiStore.getState().selection.size).toBe(1);
  });

  it("removeFromSelection: id disappears", () => {
    useUiStore.getState().addSelection("b1");
    useUiStore.getState().removeSelection("b1");
    expect(useUiStore.getState().selection.has("b1")).toBe(false);
  });

  it("toggleSelection: absent → present", () => {
    useUiStore.getState().toggleSelection("b1");
    expect(useUiStore.getState().selection.has("b1")).toBe(true);
  });

  it("toggleSelection: present → absent", () => {
    useUiStore.getState().addSelection("b1");
    useUiStore.getState().toggleSelection("b1");
    expect(useUiStore.getState().selection.has("b1")).toBe(false);
  });

  it("clearSelection: empties the set", () => {
    useUiStore.getState().addSelection("b1");
    useUiStore.getState().addSelection("b2");
    useUiStore.getState().clearSelection();
    expect(useUiStore.getState().selection.size).toBe(0);
  });

  it("selection is a Set (not an array)", () => {
    expect(useUiStore.getState().selection).toBeInstanceOf(Set);
  });
});
