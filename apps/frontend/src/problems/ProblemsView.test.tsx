/**
 * FE-39: ProblemsView tests
 *
 * Acceptance:
 * - Both registrations exist after boot; Activity and BottomTab namespaces are separate.
 * - Adding a problem updates badge count and the rendered list in both views.
 * - Reveal correctly recenters the canvas on the offending item.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { listActivities, resetActivityRegistry } from "../shell/registries/ActivityRegistry";
import { listBottomTabs, resetBottomTabRegistry } from "../shell/registries/BottomTabRegistry";
import { ProblemsView } from "./ProblemsView";
import { registerProblemsSurface } from "./register";

const sampleProblems = [
  { id: "p1", severity: "error" as const, summary: "Port type mismatch", blockId: "b1" },
  { id: "p2", severity: "warning" as const, summary: "Floating output port", blockId: "b2" },
];

describe("FE-39: ProblemsView", () => {
  it("renders all problems in the list", () => {
    render(React.createElement(ProblemsView, { problems: sampleProblems, onReveal: () => {} }));
    expect(document.body.textContent).toContain("Port type mismatch");
    expect(document.body.textContent).toContain("Floating output port");
  });

  it("clicking Reveal calls onReveal with the problem's blockId", () => {
    const onReveal = vi.fn();
    render(React.createElement(ProblemsView, { problems: sampleProblems, onReveal }));
    const revealButtons = screen.getAllByRole("button", { name: /reveal/i });
    fireEvent.click(revealButtons[0]);
    expect(onReveal).toHaveBeenCalledWith("b1");
  });

  it("error-severity items are visually distinct from warnings", () => {
    const { container } = render(
      React.createElement(ProblemsView, { problems: sampleProblems, onReveal: () => {} }),
    );
    const errorItems = container.querySelectorAll("[data-severity='error'], .severity-error");
    const warnItems = container.querySelectorAll("[data-severity='warning'], .severity-warning");
    expect(errorItems.length).toBeGreaterThan(0);
    expect(warnItems.length).toBeGreaterThan(0);
  });

  it("empty problems list renders an empty-state message", () => {
    render(React.createElement(ProblemsView, { problems: [], onReveal: () => {} }));
    expect(document.body.textContent).toMatch(/no problems|no issues|all clear/i);
  });
});

describe("FE-39: registrations", () => {
  it("core.problems is registered as Activity AND as BottomTab without conflict", async () => {
    resetActivityRegistry();
    resetBottomTabRegistry();
    registerProblemsSurface();

    const activities = listActivities();
    const tabs = listBottomTabs();

    const hasProblemActivity = activities.some((a: { id: string }) => a.id === "core.problems");
    const hasProblemTab = tabs.some((t: { id: string }) => t.id === "core.problems");

    expect(hasProblemActivity).toBe(true);
    expect(hasProblemTab).toBe(true);
  });
});
