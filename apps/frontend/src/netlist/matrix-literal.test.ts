import { describe, expect, it } from "vitest";

import { formatMatrixLiteral, matrixShape, parseMatrixLiteral } from "./matrix-literal";

const ok = (raw: string) => {
  const result = parseMatrixLiteral(raw);
  if (!result.ok) throw new Error(`expected ${raw} to parse, got: ${result.reason}`);
  return result.value;
};
const why = (raw: string) => {
  const result = parseMatrixLiteral(raw);
  if (result.ok) throw new Error(`expected ${raw} to be refused`);
  return result.reason;
};

/**
 * One notation, deliberately. Accepting both MATLAB and Python forms means
 * every consumer has to agree on two grammars and silently disagree on the
 * edge cases. Python form is enforced because the model is JSON and this is
 * already what JSON looks like.
 */
describe("parseMatrixLiteral — Python form", () => {
  it("reads a square matrix", () => {
    expect(ok("[[1, 2], [3, 4]]")).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("reads a 1x1, which is the common default", () => {
    expect(ok("[[0]]")).toEqual([[0]]);
  });

  it("reads a column and a row", () => {
    expect(ok("[[1], [0]]")).toEqual([[1], [0]]);
    expect(ok("[[1, 0]]")).toEqual([[1, 0]]);
  });

  it("tolerates whitespace and newlines", () => {
    expect(ok("[\n  [1, 2],\n  [3, 4]\n]")).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("reads negatives and decimals", () => {
    expect(ok("[[-1.5, 2e3]]")).toEqual([[-1.5, 2000]]);
  });

  it("reads engineering suffixes, like every other numeric field", () => {
    const value = ok("[[1k, 10u]]");
    expect(value[0]?.[0]).toBe(1000);
    expect(value[0]?.[1]).toBeCloseTo(1e-5, 18);
  });
});

/**
 * MATLAB form is recognised and named, not merely refused. "Invalid matrix"
 * to someone who has just typed a matrix that works everywhere else is not
 * a useful thing to be told.
 */
describe("parseMatrixLiteral — MATLAB form is named, not just refused", () => {
  it("names the semicolon row separator", () => {
    expect(why("[1 2; 3 4]")).toMatch(/MATLAB/);
    expect(why("[1 2; 3 4]")).toMatch(/\[\[1, 2\], \[3, 4\]\]/);
  });

  it("names space-separated elements", () => {
    expect(why("[[1 2], [3 4]]")).toMatch(/MATLAB/);
  });

  it("catches a semicolon even in otherwise Python-looking text", () => {
    expect(why("[[1, 2]; [3, 4]]")).toMatch(/MATLAB/);
  });
});

describe("parseMatrixLiteral — shape and syntax", () => {
  it("refuses a ragged matrix, and says which row", () => {
    const reason = why("[[1, 2], [3]]");
    expect(reason).toMatch(/Row 2/);
    expect(reason).toMatch(/same length/);
  });

  it("refuses a flat vector, and says what to write instead", () => {
    expect(why("[1, 2]")).toMatch(/\[\[1, 2\]\]/);
  });

  it("refuses unbalanced brackets", () => {
    expect(why("[[1, 2]")).toMatch(/bracket/i);
  });

  it("refuses an empty matrix", () => {
    expect(why("[]")).toMatch(/at least one row/);
    expect(why("")).toMatch(/Empty/);
  });

  it("refuses a non-numeric entry", () => {
    expect(why("[[1, x]]")).toMatch(/not a number/);
  });

  it("refuses an empty entry", () => {
    expect(why("[[1, ]]")).toMatch(/empty entry/);
  });

  it("refuses text that is not bracketed at all", () => {
    expect(why("1, 2")).toMatch(/bracketed/);
  });
});

describe("formatMatrixLiteral", () => {
  it("round-trips through the parser", () => {
    const text = formatMatrixLiteral([
      [1, 2],
      [3, 4],
    ]);
    expect(text).toBe("[[1, 2], [3, 4]]");
    expect(ok(text)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("matrixShape", () => {
  it("reads rows by columns", () => {
    expect(matrixShape([[1, 2, 3]])).toBe("1x3");
    expect(
      matrixShape([
        [1, 2],
        [3, 4],
      ]),
    ).toBe("2x2");
  });
});
