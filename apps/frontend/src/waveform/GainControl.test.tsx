import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GainControl, formatGain } from "./GainControl";
import { applyGain } from "./axes-config";

describe("formatGain", () => {
  it("writes the multiplier the way a scope does", () => {
    expect(formatGain(10)).toBe("×10");
    expect(formatGain(0.5)).toBe("×0.5");
    expect(formatGain(-1)).toBe("×-1");
  });

  it("falls back to exponent form rather than a wall of zeros", () => {
    expect(formatGain(1e6)).toBe("×1e6");
    expect(formatGain(1e-6)).toBe("×1e-6");
  });
});

describe("GainControl", () => {
  it("shows a scaled trace's factor permanently", () => {
    // A plot that can quietly misreport a measured value by a factor of ten
    // is worse than one that cannot scale at all, so "×10" must not be
    // something the user loses by moving the mouse away.
    render(
      <GainControl
        gain={10}
        signalName="I(L1)"
        editing={false}
        onEdit={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Display gain for I(L1)" });
    expect(button.textContent).toBe("×10");
    expect(button.className).toContain("axes-legend__gain--set");
  });

  it("says the scaling is display-only, where the user will read it", () => {
    render(
      <GainControl
        gain={10}
        signalName="I(L1)"
        editing={false}
        onEdit={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button").title).toMatch(
      /Measurements and exports use its real values/,
    );
  });

  it("commits a typed gain on Enter", () => {
    const onCommit = vi.fn();
    render(
      <GainControl
        gain={undefined}
        signalName="I(L1)"
        editing
        onEdit={() => {}}
        onCommit={onCommit}
        onCancel={() => {}}
      />,
    );
    const input = screen.getByLabelText("Display gain for I(L1)");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(25);
  });

  it("refuses a gain of zero, which would read as 'this signal is zero'", () => {
    const onCommit = vi.fn();
    render(
      <GainControl
        gain={undefined}
        signalName="I(L1)"
        editing
        onEdit={() => {}}
        onCommit={onCommit}
        onCancel={() => {}}
      />,
    );
    const input = screen.getByLabelText("Display gain for I(L1)");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(1);
  });
});

describe("applyGain", () => {
  it("returns the input untouched when there is nothing to do", () => {
    // Identity, not a copy: this runs on every redraw, and copying a
    // full-resolution signal per frame to multiply it by 1 is a megabyte of
    // garbage per frame for no effect.
    const values = Float64Array.from([1, 2, 3]);
    expect(applyGain(values, undefined)).toBe(values);
    expect(applyGain(values, 1)).toBe(values);
  });

  it("scales without touching the source", () => {
    const values = Float64Array.from([1, 2, 3]);
    expect(Array.from(applyGain(values, 10))).toEqual([10, 20, 30]);
    expect(Array.from(values)).toEqual([1, 2, 3]);
  });
});
