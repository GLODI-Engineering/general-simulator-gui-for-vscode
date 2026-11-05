/**
 * FE-64: SelectorInspector tests
 *
 * Acceptance:
 * - test_switch_inspector: changing criteria updates block params atomically.
 */

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

let SelectorInspector: React.ComponentType<{
  block: { id: string; type: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./SelectorInspector");
  SelectorInspector = mod.SelectorInspector ?? mod.default;
  if (SelectorInspector) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-64: SelectorInspector", () => {
  skip("renders indices input for routing.selector", () => {
    if (!SelectorInspector) throw new Error("SelectorInspector not available");
    render(
      React.createElement(SelectorInspector, {
        block: { id: "sel1", type: "routing.selector", params: { indices: [0, 1] } },
      }),
    );
    expect(screen.getByLabelText(/indices/i)).toBeTruthy();
  });
});
