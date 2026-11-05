/**
 * FE-44: EditorTabRegistry tests
 *
 * Acceptance:
 * - registerEditorTab and listEditorTabs behave identically to the
 *   BottomTabRegistry equivalents: idempotent, ordered, typed.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { listEditorTabs, registerEditorTab, resetEditorTabRegistry } from "./EditorTabRegistry";
import type { EditorTabRegistration } from "./EditorTabRegistry";

const base: Omit<EditorTabRegistration, "id" | "order"> = {
  component: () => null,
  label: "Test",
};

describe("FE-44: EditorTabRegistry", () => {
  beforeEach(() => {
    resetEditorTabRegistry();
  });

  it("register + retrieve", () => {
    registerEditorTab({ ...base, id: "schematic", order: 0 });
    const all = listEditorTabs();
    expect(all.map((t) => t.id)).toContain("schematic");
  });

  it("idempotent: registering the same id twice does not throw and keeps one entry", () => {
    registerEditorTab({ ...base, id: "schematic", order: 0 });
    expect(() => registerEditorTab({ ...base, id: "schematic", order: 0 })).not.toThrow();
    expect(listEditorTabs().filter((t) => t.id === "schematic")).toHaveLength(1);
  });

  it("tabs ordered by ascending order number", () => {
    registerEditorTab({ ...base, id: "waveforms", order: 10 });
    registerEditorTab({ ...base, id: "schematic", order: 0 });
    const ids = listEditorTabs().map((t) => t.id);
    expect(ids).toEqual(["schematic", "waveforms"]);
  });

  it("tabs with equal order sorted lexicographically by id", () => {
    registerEditorTab({ ...base, id: "z-tab", order: 5 });
    registerEditorTab({ ...base, id: "a-tab", order: 5 });
    const ids = listEditorTabs().map((t) => t.id);
    expect(ids).toEqual(["a-tab", "z-tab"]);
  });

  it("two tabs registered at boot (Schematic order=0, Waveforms order=10)", () => {
    registerEditorTab({ ...base, id: "schematic", order: 0, label: "Schematic" });
    registerEditorTab({ ...base, id: "waveforms", order: 10, label: "Waveforms" });
    const tabs = listEditorTabs();
    expect(tabs[0].id).toBe("schematic");
    expect(tabs[1].id).toBe("waveforms");
  });
});
