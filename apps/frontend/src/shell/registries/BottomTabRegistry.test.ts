/**
 * FE-05: BottomTabRegistry tests
 *
 * Acceptance:
 * - registerBottomTab() + conflict guard on duplicate id.
 * - Ordering: ascending order number.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { listBottomTabs, registerBottomTab, resetBottomTabRegistry } from "./BottomTabRegistry";
import type { BottomTabRegistration } from "./BottomTabRegistry";

const base: Omit<BottomTabRegistration, "id" | "order"> = {
  component: () => null,
  label: "Test",
};

describe("FE-05: BottomTabRegistry", () => {
  beforeEach(() => {
    resetBottomTabRegistry();
  });

  it("register + retrieve", () => {
    registerBottomTab({ ...base, id: "core.waveform", order: 10 });
    const all = listBottomTabs();
    expect(all.map((t) => t.id)).toContain("core.waveform");
  });

  it("conflict guard throws on duplicate id", () => {
    registerBottomTab({ ...base, id: "core.waveform", order: 10 });
    expect(() => registerBottomTab({ ...base, id: "core.waveform", order: 20 })).toThrow();
  });

  it("tabs ordered by ascending order number", () => {
    registerBottomTab({ ...base, id: "core.output", order: 30 });
    registerBottomTab({ ...base, id: "core.waveform", order: 10 });
    registerBottomTab({ ...base, id: "core.workspace", order: 20 });
    const ids = listBottomTabs().map((t) => t.id);
    expect(ids).toEqual(["core.waveform", "core.workspace", "core.output"]);
  });
});
