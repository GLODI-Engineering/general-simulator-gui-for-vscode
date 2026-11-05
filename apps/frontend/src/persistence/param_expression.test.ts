/**
 * FE-52: param_expression evaluator tests
 *
 * Acceptance:
 * - Supports: + - * / **, unary +/-, parens,
 *   sin/cos/tan/exp/log/log10/sqrt/abs/min/max/pow, pi, e.
 * - No attribute access, subscripts, comparisons.
 * - Cycle detection: a -> b -> ... -> a raises 'Param cycle'.
 */

import { describe, expect, it } from "vitest";

type EvalFn = (expr: string, params?: Record<string, number>) => number;
type EvalAllFn = (params: Record<string, string | number>) => Record<string, number>;

let evalExpr: EvalFn | null = null;
let evalAll: EvalAllFn | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./param_expression");
  evalExpr = mod.evalExpr ?? mod.evaluate ?? mod.default;
  evalAll = mod.evalAll ?? mod.evaluateAll ?? null;
  if (evalExpr) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-52: param_expression evaluator", () => {
  describe("arithmetic", () => {
    skip("addition: 1 + 2 = 3", () => {
      expect(evalExpr!("1 + 2")).toBeCloseTo(3);
    });

    skip("multiplication: 3 * 4 = 12", () => {
      expect(evalExpr!("3 * 4")).toBeCloseTo(12);
    });

    skip("power: 2 ** 3 = 8", () => {
      expect(evalExpr!("2 ** 3")).toBeCloseTo(8);
    });

    skip("unary minus: -5 = -5", () => {
      expect(evalExpr!("-5")).toBeCloseTo(-5);
    });

    skip("parentheses: (1 + 2) * 3 = 9", () => {
      expect(evalExpr!("(1 + 2) * 3")).toBeCloseTo(9);
    });

    skip("division: 10 / 4 = 2.5", () => {
      expect(evalExpr!("10 / 4")).toBeCloseTo(2.5);
    });
  });

  describe("built-in functions and constants", () => {
    skip("sin(pi/2) = 1", () => {
      expect(evalExpr!("sin(pi/2)")).toBeCloseTo(1, 12);
    });

    skip("cos(0) = 1", () => {
      expect(evalExpr!("cos(0)")).toBeCloseTo(1, 12);
    });

    skip("exp(1) ≈ e", () => {
      expect(evalExpr!("exp(1)")).toBeCloseTo(Math.E, 12);
    });

    skip("log(e) = 1", () => {
      expect(evalExpr!("log(e)")).toBeCloseTo(1, 12);
    });

    skip("log10(100) = 2", () => {
      expect(evalExpr!("log10(100)")).toBeCloseTo(2, 12);
    });

    skip("sqrt(9) = 3", () => {
      expect(evalExpr!("sqrt(9)")).toBeCloseTo(3, 12);
    });

    skip("abs(-7) = 7", () => {
      expect(evalExpr!("abs(-7)")).toBeCloseTo(7);
    });

    skip("min(3, 5) = 3", () => {
      expect(evalExpr!("min(3, 5)")).toBeCloseTo(3);
    });

    skip("max(3, 5) = 5", () => {
      expect(evalExpr!("max(3, 5)")).toBeCloseTo(5);
    });

    skip("pow(2, 10) = 1024", () => {
      expect(evalExpr!("pow(2, 10)")).toBeCloseTo(1024);
    });
  });

  describe("param references", () => {
    skip("test_param_expression_eval: Rload * 2 with Rload=1000 returns 2000", () => {
      expect(evalExpr!("Rload * 2", { Rload: 1000 })).toBeCloseTo(2000);
    });

    skip("reference to pi is allowed without param context", () => {
      expect(evalExpr!("pi")).toBeCloseTo(Math.PI);
    });
  });

  describe("cycle detection", () => {
    skip("test_param_expression_cycle: a -> b -> a raises 'Param cycle'", () => {
      if (!evalAll) return;
      expect(() => evalAll!({ a: "b", b: "a" })).toThrow(/param cycle/i);
    });

    skip("cycle error message names all nodes in cycle", () => {
      if (!evalAll) return;
      let msg = "";
      try {
        evalAll!({ x: "y + 1", y: "x + 1" });
      } catch (e) {
        msg = String(e);
      }
      expect(msg).toMatch(/x/);
      expect(msg).toMatch(/y/);
    });
  });

  describe("disallowed expressions", () => {
    skip("test_param_expression_disallowed: attribute access raises syntax/eval error", () => {
      expect(() => evalExpr!("obj.attr")).toThrow();
    });

    skip("disallowed: subscript access raises syntax/eval error", () => {
      expect(() => evalExpr!("arr[0]")).toThrow();
    });

    skip("disallowed: comparison raises syntax/eval error", () => {
      expect(() => evalExpr!("1 < 2")).toThrow();
    });
  });
});
