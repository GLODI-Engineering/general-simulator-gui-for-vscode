/**
 * FE-60: ParamExpressionInput tests
 *
 * Acceptance:
 * - typing '1000' commits value=1000 (number).
 * - typing 'Rload' commits value='Rload' (string) and shows the resolved 1000.
 * - typing '{Rload * 2}' commits value='{Rload * 2}' and shows 2000.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let ParamExpressionInput: React.ComponentType<{
  value?: string | number;
  params?: Record<string, number>;
  onChange?: (v: string | number) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./ParamExpressionInput");
  ParamExpressionInput = mod.ParamExpressionInput ?? mod.default;
  if (ParamExpressionInput) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-60: ParamExpressionInput", () => {
  skip("test_param_expression_input_number: typing '1000' commits value=1000 (number)", () => {
    const onChange = vi.fn();
    if (!ParamExpressionInput) throw new Error("ParamExpressionInput unavailable");
    const Comp = ParamExpressionInput;
    render(React.createElement(Comp, { params: {}, onChange }));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1000" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(1000);
  });

  skip("test_param_expression_input_reference: typing 'Rload' commits value='Rload' (string) and shows the resolved 1000", () => {
    const onChange = vi.fn();
    if (!ParamExpressionInput) throw new Error("ParamExpressionInput unavailable");
    const Comp = ParamExpressionInput;
    render(React.createElement(Comp, { params: { Rload: 1000 }, onChange }));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Rload" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith("Rload");
    expect(screen.getByText("1000")).toBeTruthy();
  });

  skip("test_param_expression_input_expr: typing '{Rload * 2}' commits value='{Rload * 2}' and shows 2000", () => {
    const onChange = vi.fn();
    if (!ParamExpressionInput) throw new Error("ParamExpressionInput unavailable");
    const Comp = ParamExpressionInput;
    render(React.createElement(Comp, { params: { Rload: 1000 }, onChange }));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "{Rload * 2}" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith("{Rload * 2}");
    expect(screen.getByText("2000")).toBeTruthy();
  });
});
