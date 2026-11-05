/**
 * FE-173/174/175: SymbolEditorTab smoke tests
 */

import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SymbolEditorTab } from "./SymbolEditorTab";
import { useSymbolEditorStore } from "./store";

describe("FE-173/174/175: SymbolEditorTab", () => {
  beforeEach(() => {
    useSymbolEditorStore.getState().reset();
  });

  it("renders without crashing", () => {
    expect(() => render(React.createElement(SymbolEditorTab))).not.toThrow();
  });

  it("renders the drawing canvas and the metadata panel", () => {
    render(React.createElement(SymbolEditorTab));
    expect(screen.getByRole("img", { name: "Symbol drawing canvas" })).toBeTruthy();
    expect(screen.getByLabelText("Type ID")).toBeTruthy();
  });

  it("reflects an already-drawn primitive and placed port from the store", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 20, h: 10 });
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 5,
      kind: "physical-electrical",
      direction: "input",
    });

    render(React.createElement(SymbolEditorTab));

    expect(screen.getByText("Ports (1)")).toBeTruthy();
    expect(screen.getByDisplayValue("p1")).toBeTruthy();
  });
});
