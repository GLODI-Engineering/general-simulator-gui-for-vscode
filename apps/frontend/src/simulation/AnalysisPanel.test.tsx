/**
 * FE-148: AnalysisPanel tests — Analyses + Initial Conditions, moved out of
 * SimSettingsPanel (which is now Solver-only) into the toolbar's
 * "Simulation" button. Carries forward FE-50's original acceptance
 * criteria for the analysis type / TRAN / AC fields.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "../store";
import { AnalysisPanel } from "./AnalysisPanel";

afterEach(cleanup);

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
});

describe("FE-148: AnalysisPanel", () => {
  it("test_seeds_default_tran: opening with no analyses seeds a default TRAN analysis with t_end visible", () => {
    render(<AnalysisPanel />);

    const tEndInput =
      screen.queryByLabelText(/t.?end/i) ?? screen.queryByPlaceholderText(/t.?end/i);
    expect(tEndInput).toBeTruthy();

    const fStart = screen.queryByLabelText(/f.?start/i);
    expect(fStart).toBeNull();
  });

  it("test_ac_shows_frequency_fields: selecting AC shows frequency range fields and hides TRAN time fields", () => {
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByRole("radio", { name: /^ac$/i }));

    expect(screen.getByLabelText(/f.?start/i)).toBeTruthy();
    expect(screen.queryByLabelText(/t.?end/i)).toBeNull();
  });

  it("test_ac_sweep_is_dropdown: the AC sweep field is a select with DEC/OCT/LIN options, not free text", () => {
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByRole("radio", { name: /^ac$/i }));

    const sweep = screen.getByLabelText(/sweep/i);
    expect(sweep.tagName).toBe("SELECT");
    const optionValues = Array.from(sweep.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionValues).toEqual(["DEC", "OCT", "LIN"]);
  });

  it("test_no_default_analysis_dropdown: there is no separate 'Default analysis' selector", () => {
    render(<AnalysisPanel />);

    expect(screen.queryByText(/default analysis/i)).toBeNull();
  });

  it("test_apply_closes: clicking Apply calls onClose", () => {
    let closed = false;
    render(
      <AnalysisPanel
        onClose={() => {
          closed = true;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    expect(closed).toBe(true);
  });
});
