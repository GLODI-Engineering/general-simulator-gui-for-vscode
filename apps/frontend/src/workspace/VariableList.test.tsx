/**
 * FE-33: WorkspaceTab (variable list) tests
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { VariableList } from "./VariableList";

describe("FE-33: WorkspaceTab / VariableList", () => {
  it("renders variable list from mock IPC update", async () => {
    const vars = [
      { name: "t", value: 0.5, shape: [] },
      { name: "y", value: [1, 2, 3], shape: [3] },
    ];
    await act(async () => {
      render(React.createElement(VariableList, { variables: vars, onSelect: () => {} }));
    });
    expect(document.body.textContent).toContain("t");
    expect(document.body.textContent).toContain("y");
  });

  it("clicking a variable triggers workspace_get exactly once", async () => {
    const onSelect = vi.fn();
    const vars = [{ name: "x", value: 42, shape: [] }];
    render(React.createElement(VariableList, { variables: vars, onSelect }));
    fireEvent.click(screen.getByText("x"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("x");
  });
});
