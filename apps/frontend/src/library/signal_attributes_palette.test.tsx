/**
 * FE-66: signal_attributes_palette tests
 *
 * Acceptance:
 * - Library browser shows Signal-attributes sub-group under Signal-flow.
 * - All four blocks present.
 */

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

let SignalAttributesPalette: React.ComponentType | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./signal_attributes_palette");
  SignalAttributesPalette = mod.SignalAttributesPalette ?? mod.default;
  if (SignalAttributesPalette) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-66: signal_attributes_palette", () => {
  it("renders Signal-attributes sub-group", () => {
    render(React.createElement(SignalAttributesPalette!));
    expect(screen.getAllByText(/signal.?attributes/i).length).toBeGreaterThan(0);
  });

  it("all four attribute blocks present", () => {
    render(React.createElement(SignalAttributesPalette!));
    expect(screen.getByText(/^IC$/i)).toBeTruthy();
    expect(screen.getByText(/signal_specification/i)).toBeTruthy();
    expect(screen.getByText(/unit_conversion/i)).toBeTruthy();
    expect(screen.getByText(/probe/i)).toBeTruthy();
  });
});
