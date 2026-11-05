/**
 * FE-60: ParamTable tests
 *
 * Acceptance:
 * - test_param_table_add: clicking 'Add row' appends a new entry with placeholder name.
 * - test_param_table_duplicate_name: entering an existing name shows inline error and does not commit.
 * - test_param_table_cycle: typing `b` into row a's value when b references a shows cycle error.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let ParamTable: React.ComponentType<{
  params?: { name: string; value: string | number; unit?: string; doc?: string }[];
  onChange?: (params: unknown[]) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./ParamTable");
  ParamTable = mod.ParamTable ?? mod.default;
  if (ParamTable) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-60: ParamTable", () => {
  skip("test_param_table_add: clicking 'Add row' appends a new entry with placeholder name", () => {
    const onChange = vi.fn();
    if (!ParamTable) throw new Error("ParamTable unavailable");
    const Comp = ParamTable;
    render(React.createElement(Comp, { params: [], onChange }));

    fireEvent.click(screen.getByRole("button", { name: /add.?row|add.?param/i }));

    expect(screen.getByPlaceholderText(/param name/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  skip("test_param_table_duplicate_name: entering an existing name shows inline error and does not commit", () => {
    const onChange = vi.fn();
    if (!ParamTable) throw new Error("ParamTable unavailable");
    const Comp = ParamTable;
    render(
      React.createElement(Comp, {
        params: [{ name: "Rload", value: 1000 }],
        onChange,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /add.?row|add/i }));
    const pendingName = screen.getByPlaceholderText(/param name/i);
    fireEvent.change(pendingName, { target: { value: "Rload" } });
    fireEvent.blur(pendingName);

    expect(screen.getByText(/name already in use|already in use|duplicate/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByText("Rload").length).toBe(1);
  });

  skip("test_param_table_cycle: typing `b` into row a's value when b references a shows the cycle error", () => {
    const onChange = vi.fn();
    if (!ParamTable) throw new Error("ParamTable unavailable");
    const Comp = ParamTable;
    render(
      React.createElement(Comp, {
        params: [
          { name: "a", value: 1 },
          { name: "b", value: "a" },
        ],
        onChange,
      }),
    );

    const rowA = screen.getByText("a").closest("tr");
    expect(rowA).toBeTruthy();
    const aValueInput = rowA?.querySelector("td.param-row__value input") as HTMLInputElement;
    expect(aValueInput).toBeTruthy();

    fireEvent.change(aValueInput, { target: { value: "b" } });
    fireEvent.blur(aValueInput);

    expect(screen.getByText(/param cycle/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
