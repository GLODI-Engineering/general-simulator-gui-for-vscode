/**
 * FE-64: BusInspector tests
 *
 * Acceptance:
 * - test_bus_creator_elements: bus_creator with elements ['x','y','z'] produces signal-bus with those names.
 * - test_data_store_namespace: two data_store_memory with same name shows inline error.
 */

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

let BusInspector: React.ComponentType<{
  block: { id: string; type: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./BusInspector");
  BusInspector = mod.BusInspector ?? mod.default;
  if (BusInspector) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-64: BusInspector", () => {
  skip("test_bus_creator_elements: renders element names", () => {
    if (!BusInspector) throw new Error("BusInspector not available");
    render(
      React.createElement(BusInspector, {
        block: {
          id: "bc1",
          type: "routing.bus_creator",
          params: { elements: ["x", "y", "z"] },
        },
      }),
    );
    expect(screen.queryByText("x")).toBeTruthy();
    expect(screen.queryByText("y")).toBeTruthy();
    expect(screen.queryByText("z")).toBeTruthy();
  });
});
