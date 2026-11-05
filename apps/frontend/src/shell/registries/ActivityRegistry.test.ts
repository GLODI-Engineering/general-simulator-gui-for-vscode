/**
 * FE-05: ActivityRegistry tests
 *
 * Acceptance:
 * - registerActivity() + conflict guard on duplicate id.
 * - Ordering: ascending number, then lexicographic id.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { listActivities, registerActivity, resetActivityRegistry } from "./ActivityRegistry";
import type { ActivityRegistration } from "./ActivityRegistry";

// The registry is a module-level Map. We use vi.resetModules per describe block
// is impractical in ESM Vitest — instead we track ids we registered and ensure
// uniqueness across tests by using beforeEach with freshly imported module.
// Since we can't easily reset the singleton, we use unique IDs per test.

const base: Omit<ActivityRegistration, "id" | "order"> = {
  component: () => null,
  icon: null,
  label: "Test",
};

describe("FE-05: ActivityRegistry", () => {
  beforeEach(() => {
    resetActivityRegistry();
  });

  it("register + retrieve", () => {
    registerActivity({ ...base, id: "core.library", order: 30 });
    const all = listActivities();
    expect(all.map((a) => a.id)).toContain("core.library");
  });

  it("conflict guard throws on duplicate id", () => {
    registerActivity({ ...base, id: "core.library", order: 30 });
    expect(() => registerActivity({ ...base, id: "core.library", order: 31 })).toThrow();
  });

  it("activities ordered: ascending number then lexicographic id", () => {
    registerActivity({ ...base, id: "core.search", order: 20 });
    registerActivity({ ...base, id: "core.library", order: 30 });
    registerActivity({ ...base, id: "core.explorer", order: 10 });
    const ids = listActivities().map((a) => a.id);
    expect(ids).toEqual(["core.explorer", "core.search", "core.library"]);
  });
});
