/**
 * FE-39: problems-store tests
 *
 * Acceptance:
 * - Adding a problem updates badge count and rendered list.
 * - Clearing problems resets to zero.
 */

import { describe, expect, it } from "vitest";
import { createProblemsStore } from "./problems-store";

describe("FE-39: problems-store", () => {
  let store: {
    problems: unknown[];
    setProblems: (p: unknown[]) => void;
    clear: () => void;
    badgeCount: number;
    hasErrors: boolean;
  };

  it("initial state has zero problems", () => {
    store = createProblemsStore();
    expect(store.problems).toHaveLength(0);
    expect(store.badgeCount).toBe(0);
    expect(store.hasErrors).toBe(false);
  });

  it("setProblems updates count and hasErrors flag", () => {
    store = createProblemsStore();
    store.setProblems([
      { id: "p1", severity: "error", summary: "Bad type", blockId: "b1" },
      { id: "p2", severity: "warning", summary: "Float port", blockId: "b2" },
    ]);
    expect(store.badgeCount).toBe(2);
    expect(store.hasErrors).toBe(true);
  });

  it("clear() resets to zero", () => {
    store = createProblemsStore();
    store.setProblems([{ id: "p1", severity: "error", summary: "x", blockId: "b1" }]);
    store.clear();
    expect(store.badgeCount).toBe(0);
    expect(store.problems).toHaveLength(0);
  });

  it("warning-only problems: hasErrors is false", () => {
    store = createProblemsStore();
    store.setProblems([{ id: "p1", severity: "warning", summary: "y", blockId: "b1" }]);
    expect(store.hasErrors).toBe(false);
    expect(store.badgeCount).toBe(1);
  });
});
