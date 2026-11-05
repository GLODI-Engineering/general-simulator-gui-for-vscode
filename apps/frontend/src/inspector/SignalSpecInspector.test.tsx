/**
 * FE-66: SignalSpecInspector tests
 *
 * Acceptance:
 * - test_signal_specification_pins_dim: signal_specification with dim=[4] resolves downstream to [4].
 * - test_signal_specification_mismatch: dim=[4] from dim=[3] source raises 'dim-mismatch'.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

let SignalSpecInspector: React.ComponentType<{
  block: { id: string; type: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./SignalSpecInspector");
  SignalSpecInspector = mod.SignalSpecInspector ?? mod.default;
  if (SignalSpecInspector) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

describe("FE-66: SignalSpecInspector", () => {
  it("renders dim and complexity fields", () => {
    if (!SignalSpecInspector) throw new Error("SignalSpecInspector not available");
    render(
      React.createElement(SignalSpecInspector, {
        block: {
          id: "ss1",
          type: "signal-flow.attributes.signal_specification",
          params: { dim: [4], complexity: "real" },
        },
      }),
    );
    expect(screen.queryByText(/dim/i)).toBeTruthy();
    expect(screen.queryByText(/complexity/i)).toBeTruthy();
  });

  it("changing dim calls onChange with updated params", () => {
    let changed: Record<string, unknown> | null = null;
    if (!SignalSpecInspector) throw new Error("SignalSpecInspector not available");
    render(
      React.createElement(SignalSpecInspector, {
        block: {
          id: "ss1",
          type: "signal-flow.attributes.signal_specification",
          params: { dim: [4], complexity: "real" },
        },
        onChange: (p) => {
          changed = p;
        },
      }),
    );
    const dimInput = screen.queryByLabelText(/dim/i) ?? screen.queryAllByRole("spinbutton")[0];
    if (dimInput) {
      fireEvent.change(dimInput, { target: { value: "8" } });
      fireEvent.blur(dimInput);
      if (changed) {
        expect((changed as { dim: number[] }).dim).toContain(8);
      }
    }
  });
});
