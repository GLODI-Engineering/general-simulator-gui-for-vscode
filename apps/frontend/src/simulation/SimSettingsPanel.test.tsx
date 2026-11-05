/**
 * FE-148: SimSettingsPanel tests — now Solver-only (Analyses and Initial
 * Conditions moved to AnalysisPanel, opened from the toolbar's "Simulation"
 * button instead of the gear-icon Settings dialog).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "../store";
import { SimSettingsPanel } from "./SimSettingsPanel";

afterEach(cleanup);

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
});

describe("FE-148: SimSettingsPanel", () => {
  it("test_solver_only: shows solver fields and nothing else (no analysis type, no tabs)", () => {
    render(<SimSettingsPanel />);

    expect(screen.getByLabelText(/abstol/i)).toBeTruthy();
    expect(screen.getByLabelText(/reltol/i)).toBeTruthy();
    expect(screen.getByLabelText(/method_options/i)).toBeTruthy();

    // No tab bar — there's only one sub-editor to show.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("radio", { name: /tran/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add analysis/i })).toBeNull();
  });

  it("test_apply_closes: clicking Apply calls onClose", () => {
    let closed = false;
    render(
      <SimSettingsPanel
        onClose={() => {
          closed = true;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    expect(closed).toBe(true);
  });
});
