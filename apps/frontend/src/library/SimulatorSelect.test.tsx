/**
 * FE-45: SimulatorSelect component tests
 *
 * v1 ships general-simulator as the only target, so the dropdown offers exactly
 * two choices: "All simulators" and "General Simulator". The store defaults to
 * "general-simulator" so the palette opens already filtered.
 *
 * Acceptance:
 * - Both options render, and nothing else does.
 * - The removed ngspice/xyce/scipy options are gone.
 * - Switching to "all" and back updates the activeSimulator store slice.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "../store/library";
import { SimulatorSelect } from "./SimulatorSelect";
import { loadSimulatorCompat } from "./simulator-compat";

afterEach(cleanup);

describe("FE-45: SimulatorSelect", () => {
  beforeEach(() => {
    // Reset store to its shipped default before each test
    useLibraryStore.setState({ activeSimulator: "general-simulator" });
  });

  it("renders an 'All simulators' option", () => {
    render(React.createElement(SimulatorSelect));
    const options = screen.getAllByRole("option");
    const allOption = options.find((o) => o.textContent === "All simulators");
    expect(allOption).toBeDefined();
    expect((allOption as HTMLOptionElement).value).toBe("all");
  });

  it("renders one option for each simulator in the compat map", () => {
    const { simulators } = loadSimulatorCompat();
    render(React.createElement(SimulatorSelect));
    for (const sim of simulators) {
      const option = screen.getByRole("option", { name: sim.label });
      expect(option).toBeDefined();
      expect((option as HTMLOptionElement).value).toBe(sim.id);
    }
  });

  it("offers exactly 'All simulators' and 'General Simulator'", () => {
    render(React.createElement(SimulatorSelect));
    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(["all", "general-simulator"]);
    expect(options.map((o) => o.textContent)).toEqual(["All simulators", "General Simulator"]);
  });

  it("no longer offers the removed ngspice/xyce/scipy targets", () => {
    render(React.createElement(SimulatorSelect));
    const values = (screen.getAllByRole("option") as HTMLOptionElement[]).map((o) => o.value);
    for (const removed of ["ngspice", "xyce", "scipy"]) {
      expect(values).not.toContain(removed);
    }
  });

  it("defaults to 'general-simulator' selected", () => {
    render(React.createElement(SimulatorSelect));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("general-simulator");
  });

  it("selecting 'all' updates the activeSimulator store slice", () => {
    render(React.createElement(SimulatorSelect));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "all" } });
    expect(useLibraryStore.getState().activeSimulator).toBe("all");
  });

  it("selecting 'general-simulator' after 'all' resets the store", () => {
    useLibraryStore.setState({ activeSimulator: "all" });
    render(React.createElement(SimulatorSelect));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "general-simulator" } });
    expect(useLibraryStore.getState().activeSimulator).toBe("general-simulator");
  });

  it("has an accessible aria-label", () => {
    render(React.createElement(SimulatorSelect));
    const select = screen.getByRole("combobox");
    expect(select.getAttribute("aria-label")).toBeTruthy();
  });
});
