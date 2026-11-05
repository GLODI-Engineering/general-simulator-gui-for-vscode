/**
 * Tests for `tryEvalExpr`, the entry point that replaced the two `new Function`
 * evaluators in `store/model.ts` and `inspector/ParamExpressionInput.tsx`.
 *
 * `param_expression.test.ts` covers the grammar itself (FE-52). What matters
 * here is the swap: the same inputs those call sites used to hand to
 * `new Function` must still produce the same numbers, the constructs the format
 * spec forbids must now be rejected rather than quietly evaluated as
 * JavaScript, and every failure must surface as `null` rather than an
 * exception — both call sites treat "not evaluatable yet" as normal.
 */
import { describe, expect, it } from "vitest";

import { tryEvalExpr } from "./param_expression";

describe("tryEvalExpr", () => {
  it("evaluates the expression the ParamExpressionInput fixture uses", () => {
    // From ParamExpressionInput.test.tsx: typing '{Rload * 2}' shows 2000.
    // The braces are stripped by the caller, so both forms must work.
    expect(tryEvalExpr("Rload * 2", { Rload: 1000 })).toBe(2000);
    expect(tryEvalExpr("{Rload * 2}", { Rload: 1000 })).toBe(2000);
  });

  it("evaluates arithmetic with the documented precedence and associativity", () => {
    expect(tryEvalExpr("1 + 2 * 3", {})).toBe(7);
    expect(tryEvalExpr("(1 + 2) * 3", {})).toBe(9);
    expect(tryEvalExpr("10 / 4", {})).toBe(2.5);
    expect(tryEvalExpr("10 - 3 - 2", {})).toBe(5);
    // `**` is right-associative: 2 ** (3 ** 2), not (2 ** 3) ** 2.
    expect(tryEvalExpr("2 ** 3 ** 2", {})).toBe(512);
    expect(tryEvalExpr("-2 ** 2", {})).toBe(4);
  });

  it("supports the spec's functions and constants", () => {
    expect(tryEvalExpr("sqrt(9)", {})).toBe(3);
    expect(tryEvalExpr("max(3, 5)", {})).toBe(5);
    expect(tryEvalExpr("pow(2, 10)", {})).toBe(1024);
    expect(tryEvalExpr("abs(-7)", {})).toBe(7);
    expect(tryEvalExpr("pi", {})).toBeCloseTo(Math.PI, 12);
    expect(tryEvalExpr("sin(pi / 2)", {})).toBeCloseTo(1, 12);
  });

  it("reads scientific notation and decimals the way the format spec writes them", () => {
    expect(tryEvalExpr("1.5e-6", {})).toBeCloseTo(1.5e-6, 18);
    expect(tryEvalExpr("Cout * 2", { Cout: 4.7e-6 })).toBeCloseTo(9.4e-6, 18);
  });

  it("substitutes param references, including in nested expressions", () => {
    expect(tryEvalExpr("Vin / Rload", { Vin: 12, Rload: 4 })).toBe(3);
    expect(tryEvalExpr("sqrt(L * C)", { L: 2, C: 8 })).toBe(4);
  });

  describe("returns null rather than throwing", () => {
    it("for a malformed expression", () => {
      expect(tryEvalExpr("1 +", {})).toBeNull();
      expect(tryEvalExpr("(1 + 2", {})).toBeNull();
      expect(tryEvalExpr("* 3", {})).toBeNull();
      expect(tryEvalExpr("1 2", {})).toBeNull();
      expect(tryEvalExpr("", {})).toBeNull();
    });

    it("for an unknown identifier — the half-typed case the inspector shows", () => {
      expect(tryEvalExpr("Rload * 2", {})).toBeNull();
      expect(tryEvalExpr("nosuchfn(1)", {})).toBeNull();
    });

    it("for a non-finite result", () => {
      expect(tryEvalExpr("1 / 0", {})).toBeNull();
      expect(tryEvalExpr("log(-1)", {})).toBeNull();
      expect(tryEvalExpr("0 / 0", {})).toBeNull();
    });
  });

  describe("rejects what the format spec disallows (§5.2)", () => {
    // Under the old `new Function` evaluator several of these were valid
    // JavaScript and evaluated happily. Rejecting them is the point.
    it.each([
      ["attribute access", "obj.attr"],
      ["subscripts", "arr[0]"],
      ["comparisons", "1 < 2"],
      ["conditionals", "1 ? 2 : 3"],
      ["string literals", "'x'"],
      ["dunder identifiers", "__proto__"],
      ["property lookup on globals", "Math.sqrt(4)"],
      ["constructor access", "constructor"],
      ["assignment", "x = 1"],
      ["sequencing", "1, 2"],
    ])("%s", (_label, expression) => {
      expect(tryEvalExpr(expression, {})).toBeNull();
    });

    it("cannot reach a value that was never passed in as a param", () => {
      // `globalThis` and friends were in scope for `new Function`; the parser
      // only ever resolves names from the params map and its own constants.
      expect(tryEvalExpr("globalThis", {})).toBeNull();
      expect(tryEvalExpr("Math", {})).toBeNull();
    });
  });
});
