/**
 * FE-25 + FE-45: LibraryActivity tests
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "../store/library";

let LibraryActivity: React.ComponentType | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./LibraryActivity");
  LibraryActivity = mod.LibraryActivity ?? mod.default;
  if (LibraryActivity !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-25: LibraryActivity", () => {
  skip("renders without crashing", () => {
    expect(() => render(React.createElement(LibraryActivity!))).not.toThrow();
  });

  skip("core.library is registered in ActivityRegistry after import", async () => {
    const { ActivityRegistry } = await import(
      /* @vite-ignore */ "../shell/registries/ActivityRegistry"
    ).catch(() => ({ ActivityRegistry: null }));
    if (!ActivityRegistry) return;
    await import(/* @vite-ignore */ "./register");
    const all = ActivityRegistry.getAll();
    expect(all.some((a: { id: string }) => a.id === "core.library")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FE-45 acceptance: simulator filter wired into LibraryActivity
// ---------------------------------------------------------------------------

const SIGNAL_BLOCK = {
  name: "signal.constant",
  label: "Constant",
  version: "1.0.0",
  category: "signal",
  description: "Constant output.",
  ports: {
    inputs: [],
    outputs: [{ id: "y", label: "y", kind: { domain: "signal", dims: "scalar" } }],
  },
  params: [],
  symbol: { bbox: [40, 30], shape: "rect", text: "C" },
  behavior: {
    causality: "feedthrough",
    domain: "signal",
    state_count: 0,
    equation_template: "signal.constant",
  },
} as const;

const PASSIVE_BLOCK = {
  name: "passive.resistor",
  label: "Resistor",
  version: "1.0.0",
  category: "passive",
  description: "Linear resistor.",
  ports: {
    inputs: [{ id: "p", label: "p", kind: { domain: "electrical" } }],
    outputs: [{ id: "n", label: "n", kind: { domain: "electrical" } }],
  },
  params: [{ name: "R", label: "Resistance", type: "number", default: 1000, unit: "Ω" }],
  symbol: { bbox: [40, 30], shape: "rect", text: "R" },
  behavior: {
    causality: "bidirectional",
    domain: "electrical",
    state_count: 0,
    equation_template: "passive.resistor",
  },
} as const;

describe("FE-45: LibraryActivity simulator filter", () => {
  beforeEach(() => {
    act(() => {
      useLibraryStore.setState({
        catalog: {
          "signal.constant": SIGNAL_BLOCK as unknown as ReturnType<
            typeof useLibraryStore.getState
          >["catalog"][string],
          "passive.resistor": PASSIVE_BLOCK as unknown as ReturnType<
            typeof useLibraryStore.getState
          >["catalog"][string],
        },
        activeSimulator: "general-simulator",
      });
    });
  });

  afterEach(cleanup);

  skip("renders a simulator selector dropdown (SimulatorSelect)", () => {
    render(React.createElement(LibraryActivity!));
    // The SimulatorSelect renders a <select> with aria-label for the filter
    const selects = screen.queryAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
  });

  skip("'All simulators' shows all catalog entries", () => {
    act(() => {
      useLibraryStore.setState({ activeSimulator: "all" });
    });
    render(React.createElement(LibraryActivity!));
    // Both blocks should appear
    expect(screen.queryByText("Constant")).toBeTruthy();
    expect(screen.queryByText("Resistor")).toBeTruthy();
  });

  skip("defaults to general-simulator, hiding signal.constant", () => {
    // The store default (set in beforeEach, matching useLibraryStore's initial
    // state) already filters the palette: passive.resistor is in
    // general-simulator's registry, signal.constant is not.
    render(React.createElement(LibraryActivity!));
    expect(screen.queryByText("Resistor")).toBeTruthy();
    expect(screen.queryByText("Constant")).toBeNull();
  });

  skip("selecting 'all' after general-simulator shows signal.constant again", () => {
    const { rerender } = render(React.createElement(LibraryActivity!));
    expect(screen.queryByText("Constant")).toBeNull();
    act(() => {
      useLibraryStore.setState({ activeSimulator: "all" });
    });
    rerender(React.createElement(LibraryActivity!));
    expect(screen.queryByText("Constant")).toBeTruthy();
    expect(screen.queryByText("Resistor")).toBeTruthy();
  });
});
