import { describe, expect, it } from "vitest";

import { polynomial } from "./transferFunction";

/**
 * A transfer function's coefficients are what the netlist carries, and they
 * were drawn raw: a plain integrator, `num=[1] den=[1,0]`, labelled itself
 * "1" over "1,0". That is not hard to read so much as the wrong thing to
 * read -- "1,0" is a pair of numbers, and the block is 1/s.
 */
describe("coefficients drawn as a polynomial in s", () => {
  it("writes a plain integrator as 1/s", () => {
    expect(polynomial([1], "N(s)")).toBe("1");
    expect(polynomial([1, 0], "D(s)")).toBe("s");
  });

  it("leaves out the 1s a reader supplies", () => {
    // s^2 + s + 1, not 1s^2 + 1s + 1.
    expect(polynomial([1, 1, 1], "D(s)")).toBe("s² + s + 1");
  });

  it("keeps a coefficient that is not 1", () => {
    expect(polynomial([2, 3], "D(s)")).toBe("2s + 3");
  });

  it("drops zero terms rather than writing 0s", () => {
    expect(polynomial([1, 0, 4], "D(s)")).toBe("s² + 4");
  });

  it("subtracts instead of adding a negative", () => {
    expect(polynomial([1, -2], "D(s)")).toBe("s − 2");
    expect(polynomial([-1, 2], "D(s)")).toBe("−s + 2");
  });

  it("reads the list however it is spelled", () => {
    // The netlist spells it "[1,0]"; a document may carry the array itself.
    for (const form of [[1, 0], "[1,0]", "1,0"] as const) {
      expect(polynomial(form, "D(s)")).toBe("s");
    }
  });

  it("falls back when there is nothing to read", () => {
    expect(polynomial(undefined, "D(s)")).toBe("D(s)");
    expect(polynomial("not a polynomial", "D(s)")).toBe("D(s)");
  });

  it("writes the all-zero polynomial as 0", () => {
    expect(polynomial([0, 0], "D(s)")).toBe("0");
  });

  it("rounds a long coefficient rather than overflowing the box", () => {
    // Math.SQRT2 is 1.4142135623730951 exactly — seventeen significant digits,
    // which is the point: it must print as "1.41s" and not overflow the symbol.
    expect(polynomial([Math.SQRT2, 0], "D(s)")).toBe("1.41s");
  });
});
