/**
 * FE-66: UnitConversionInspector tests
 *
 * Acceptance:
 * - Renders from_unit and to_unit fields.
 * - Unknown unit shows inline error.
 */

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

let UnitConversionInspector: React.ComponentType<{
  block: { id: string; type: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./UnitConversionInspector");
  UnitConversionInspector = mod.UnitConversionInspector ?? mod.default;
  if (UnitConversionInspector) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-66: UnitConversionInspector", () => {
  it("renders from_unit and to_unit fields", () => {
    if (!UnitConversionInspector) throw new Error("UnitConversionInspector not available");
    render(
      React.createElement(UnitConversionInspector, {
        block: {
          id: "uc1",
          type: "signal-flow.attributes.unit_conversion",
          params: { from_unit: "m", to_unit: "cm" },
        },
      }),
    );
    expect(
      screen.queryByLabelText(/from.?unit/i) ?? screen.queryByText(/from.?unit/i),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/to.?unit/i) ?? screen.queryByText(/to.?unit/i)).toBeTruthy();
  });

  it("unknown unit shows inline error", () => {
    if (!UnitConversionInspector) throw new Error("UnitConversionInspector not available");
    render(
      React.createElement(UnitConversionInspector, {
        block: {
          id: "uc1",
          type: "signal-flow.attributes.unit_conversion",
          params: { from_unit: "furlongs_per_fortnight", to_unit: "m" },
        },
      }),
    );
    expect(screen.queryByText(/unknown.?unit|invalid.?unit/i)).toBeTruthy();
  });
});
