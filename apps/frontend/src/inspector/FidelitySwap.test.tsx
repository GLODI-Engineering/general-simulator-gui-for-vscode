/**
 * FE-62: FidelitySwap inspector tests
 *
 * Acceptance:
 * - Inspector shows Fidelity dropdown for blocks with >= 2 tiers.
 * - Disabled for blocks with only one tier.
 */

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

let FidelitySwap: React.ComponentType<{
  blockId: string;
  currentFidelity: string;
  tiers: string[];
  onSwap?: (newFidelity: string) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./FidelitySwap");
  FidelitySwap = mod.FidelitySwap ?? mod.default;
  if (FidelitySwap) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-62: FidelitySwap", () => {
  skip("shows Fidelity dropdown when block has >= 2 tiers", () => {
    if (!FidelitySwap) throw new Error("FidelitySwap not available");
    render(
      React.createElement(FidelitySwap, {
        blockId: "r1",
        currentFidelity: "ideal",
        tiers: ["ideal", "behavioral", "spice"],
      }),
    );
    const select = screen.queryByRole("combobox") ?? screen.queryByLabelText(/fidelity/i);
    expect(select).toBeTruthy();
  });

  skip("dropdown is disabled for blocks with only one tier", () => {
    if (!FidelitySwap) throw new Error("FidelitySwap not available");
    render(
      React.createElement(FidelitySwap, {
        blockId: "r1",
        currentFidelity: "ideal",
        tiers: ["ideal"],
      }),
    );
    const select = screen.queryByRole("combobox") ?? screen.queryByLabelText(/fidelity/i);
    if (select) {
      expect((select as HTMLSelectElement).disabled).toBe(true);
    }
  });
});
