import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { listActivities, resetActivityRegistry } from "../shell/registries/ActivityRegistry";
import { useGraphStore, useUiStore } from "../store";
import { SearchActivity } from "./SearchActivity";
import { registerSearchActivity } from "./register";

function loadSampleSchematic() {
  useGraphStore.getState().loadDocument({
    schema_version: 2,
    model: {
      id: "model-1",
      name: "Search fixture",
      grid: 10,
      params: [],
      blocks: [
        {
          id: "gain_1",
          type: "control.gain",
          paradigm: "signal",
          domain: "signal",
          fidelity: "ideal",
          position: [0, 0],
          rotation: 0,
          mirror: "none",
          params: { k: 2 },
          ic: {},
          label: "Forward gain",
        },
      ],
      wires: [
        {
          id: "w_out",
          from: { block: "gain_1", port: "out" },
          to: { block: "gain_1", port: "in" },
          waypoints: [],
          pinned: false,
          net: "VOUT",
          kind: "signal",
        },
      ],
      lines: [],
      nets: [],
      simulation: {},
      metadata: {},
    },
  });
}

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  resetActivityRegistry();
  loadSampleSchematic();
});

describe("SearchActivity", () => {
  it("renders without crashing", () => {
    expect(() => render(React.createElement(SearchActivity))).not.toThrow();
  });

  it("shows no results until something is typed", () => {
    render(React.createElement(SearchActivity));
    expect(screen.getByLabelText("Search results").children).toHaveLength(0);
  });

  it("lists a matching block once the query is typed", () => {
    render(React.createElement(SearchActivity));
    fireEvent.change(screen.getByLabelText("Find in schematic"), { target: { value: "gain" } });
    expect(document.body.textContent).toContain("gain_1");
  });

  it("finds a wire by its net name", () => {
    render(React.createElement(SearchActivity));
    fireEvent.change(screen.getByLabelText("Find in schematic"), { target: { value: "VOUT" } });
    expect(document.body.textContent).toContain("VOUT");
  });

  it("says so when the schematic has no match", () => {
    render(React.createElement(SearchActivity));
    fireEvent.change(screen.getByLabelText("Find in schematic"), { target: { value: "zzzz" } });
    expect(document.body.textContent).toContain("No match in this schematic.");
  });

  it("clicking a result selects that block, which is how the canvas reveals it", () => {
    render(React.createElement(SearchActivity));
    fireEvent.change(screen.getByLabelText("Find in schematic"), { target: { value: "gain_1" } });
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect([...useUiStore.getState().selection]).toEqual(["gain_1"]);
  });

  it("registers itself in the reserved core.search activity slot", () => {
    registerSearchActivity();
    const search = listActivities().find((activity) => activity.id === "core.search");
    expect(search).toBeDefined();
    expect(search?.label).toBe("Search");
  });
});
