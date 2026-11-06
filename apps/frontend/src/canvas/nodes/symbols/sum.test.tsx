import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DrawContext } from "../symbol-drawing";
import drawing from "./sum";

function signsDrawn(signs: unknown): string[] {
  const ctx = {
    width: 120,
    height: 80,
    rotation: 0,
    mirror: "none",
    params: { signs },
  } as unknown as DrawContext;
  const { container } = render(<svg aria-label="sum">{drawing.draw(ctx)}</svg>);
  return [...container.querySelectorAll("text")]
    .map((t) => t.textContent ?? "")
    .filter((s) => s === "+" || s === "−");
}

/**
 * The catalogue declares `signs` a string defaulting to "++"; gsim-core reads
 * it with `as_array`, so any document that actually compiles carries
 * `[1, -1]`. Reading only the string form meant every sum on a compilable
 * sheet fell back to the default: a three-input summing junction drew two
 * inputs, one of them negated, and nothing in the picture was true.
 */
describe("a summing junction draws one sign per input", () => {
  it("reads the array form the compiler requires", () => {
    expect(signsDrawn([1, 1, 1])).toEqual(["+", "+", "+"]);
    expect(signsDrawn([1, -1])).toEqual(["+", "−"]);
    expect(signsDrawn([1, -1, 1, -1])).toEqual(["+", "−", "+", "−"]);
  });

  it("still reads the string form the catalogue documents", () => {
    expect(signsDrawn("++")).toEqual(["+", "+"]);
    expect(signsDrawn("+-+")).toEqual(["+", "−", "+"]);
  });

  it("reads a comma-separated list as numbers, not characters", () => {
    // "1,-1" is two inputs, not four glyphs.
    expect(signsDrawn("1,-1")).toEqual(["+", "−"]);
  });

  it("falls back to two inputs when there is nothing to read", () => {
    expect(signsDrawn(undefined)).toEqual(["+", "−"]);
  });
});
