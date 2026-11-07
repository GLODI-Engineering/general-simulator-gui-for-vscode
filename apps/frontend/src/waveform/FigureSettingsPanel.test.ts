import { describe, expect, it } from "vitest";

import { clampGrid } from "./FigureSettingsPanel";

/**
 * The bug these guard: the dialog clamped on every keystroke, so the empty
 * string a person must pass through to retype a number was destroyed as they
 * typed. `Number("")` is 0 and `Math.max(1, 0)` is 1, so deleting the digit
 * instantly put it back and the field could never be cleared.
 *
 * The clamp now runs where the value is *used*, and these say what it must do
 * with the half-finished input the box legitimately holds while editing.
 */
describe("clampGrid", () => {
  it("falls back while the box is empty, so a digit can be deleted", () => {
    expect(clampGrid("", 3)).toBe(3);
    expect(clampGrid("   ", 2)).toBe(2);
  });

  it("falls back on input that is not a number", () => {
    expect(clampGrid("abc", 4)).toBe(4);
    expect(clampGrid("-", 1)).toBe(1);
  });

  it("reads a typed number", () => {
    expect(clampGrid("3", 1)).toBe(3);
    expect(clampGrid("8", 1)).toBe(8);
  });

  it("holds the grid inside its bounds", () => {
    expect(clampGrid("0", 1)).toBe(1);
    expect(clampGrid("-5", 1)).toBe(1);
    expect(clampGrid("99", 1)).toBe(8);
  });

  it("rounds a fractional entry rather than refusing it", () => {
    expect(clampGrid("2.4", 1)).toBe(2);
    expect(clampGrid("2.6", 1)).toBe(3);
  });

  it("does not treat a leading zero or whitespace as junk", () => {
    expect(clampGrid("03", 1)).toBe(3);
    expect(clampGrid(" 4 ", 1)).toBe(4);
  });
});
