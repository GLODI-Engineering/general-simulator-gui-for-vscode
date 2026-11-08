import { describe, expect, it } from "vitest";

import {
  formatSiValue,
  isAmbiguousSuffix,
  looksNumeric,
  paramValueFrom,
  parseSpiceNumber,
  spiceValueOf,
} from "./spice-number";

/**
 * These mirror `parse_spice_number` in general-mna (`src/expression.rs`).
 * The frontend's job is to show what the solver will read, so where the
 * grammar is surprising these tests state the surprise rather than the
 * expectation.
 */
describe("parseSpiceNumber", () => {
  it("reads a plain number", () => {
    expect(spiceValueOf("1000")).toBe(1000);
    expect(spiceValueOf("-2.5")).toBe(-2.5);
    expect(spiceValueOf("0")).toBe(0);
  });

  it("reads scientific notation before trying suffixes", () => {
    // Not base 1 with an "e3" suffix: plain float parsing comes first.
    expect(spiceValueOf("1e3")).toBe(1000);
    expect(spiceValueOf("2.2E-6")).toBeCloseTo(2.2e-6, 18);
  });

  it("reads every multiplier the solver knows", () => {
    expect(spiceValueOf("1t")).toBe(1e12);
    expect(spiceValueOf("1g")).toBe(1e9);
    expect(spiceValueOf("2k")).toBe(2e3);
    expect(spiceValueOf("1n")).toBeCloseTo(1e-9, 20);
    expect(spiceValueOf("1p")).toBeCloseTo(1e-12, 24);
    expect(spiceValueOf("1f")).toBeCloseTo(1e-15, 27);
  });

  /**
   * The expensive one. `M` is milli in SPICE, and in power electronics it is
   * routinely written meaning mega — a factor of 10^9 on a resistance.
   */
  it("treats M as milli, not mega", () => {
    expect(spiceValueOf("1M")).toBeCloseTo(1e-3, 12);
    expect(spiceValueOf("1m")).toBeCloseTo(1e-3, 12);
    expect(spiceValueOf("10M")).toBeCloseTo(1e-2, 12);
  });

  it("spells mega as MEG, in any case", () => {
    expect(spiceValueOf("1MEG")).toBe(1e6);
    expect(spiceValueOf("1meg")).toBe(1e6);
    expect(spiceValueOf("2.2Meg")).toBeCloseTo(2.2e6, 6);
  });

  it("is case-insensitive about every suffix", () => {
    expect(spiceValueOf("1U")).toBe(spiceValueOf("1u"));
    expect(spiceValueOf("1K")).toBe(spiceValueOf("1k"));
    expect(spiceValueOf("1P")).toBe(spiceValueOf("1p"));
  });

  it("ignores a trailing unit, as SPICE does", () => {
    expect(spiceValueOf("1kohm")).toBe(1000);
    expect(spiceValueOf("10uF")).toBeCloseTo(1e-5, 12);
    expect(spiceValueOf("3.6uH")).toBeCloseTo(3.6e-6, 14);
    expect(spiceValueOf("1MEGohm")).toBe(1e6);
  });

  it("refuses a suffix the solver does not know", () => {
    expect(parseSpiceNumber("1x")).toBeNull();
    expect(parseSpiceNumber("1z")).toBeNull();
  });

  it("refuses text that is not a number at all", () => {
    expect(parseSpiceNumber("")).toBeNull();
    expect(parseSpiceNumber("   ")).toBeNull();
    expect(parseSpiceNumber("abc")).toBeNull();
    expect(parseSpiceNumber("k10")).toBeNull();
  });

  it("refuses a comma as a decimal point, which this grammar does not accept", () => {
    expect(parseSpiceNumber("1,5")).toBeNull();
  });

  it("reports the suffix as written, for echoing back", () => {
    expect(parseSpiceNumber("3.6uH")?.suffix).toBe("uH");
    expect(parseSpiceNumber("1MEG")?.factor).toBe(1e6);
    expect(parseSpiceNumber("42")?.suffix).toBe("");
  });
});

describe("formatSiValue", () => {
  /** The echo must be unambiguous exactly where the input is not. */
  it("writes mega as M and milli as m", () => {
    expect(formatSiValue(1e6, "Ω")).toBe("1 MΩ");
    expect(formatSiValue(1e-3, "Ω")).toBe("1 mΩ");
  });

  it("shows the trap: 1M in the box is one milliohm", () => {
    const parsed = parseSpiceNumber("1M")!;
    expect(formatSiValue(parsed.value, "Ω")).toBe("1 mΩ");
  });

  it("uses the micro sign rather than a letter u", () => {
    expect(formatSiValue(3.6e-6, "H")).toBe("3.6 µH");
  });

  it("handles zero and plain magnitudes", () => {
    expect(formatSiValue(0, "V")).toBe("0 V");
    expect(formatSiValue(48, "V")).toBe("48 V");
  });

  it("keeps negatives", () => {
    expect(formatSiValue(-2.5e-3, "A")).toBe("-2.5 mA");
  });

  it("works without a unit", () => {
    expect(formatSiValue(1500)).toBe("1.5 k");
  });

  it("does not drown the reader in digits", () => {
    expect(formatSiValue(1 / 3)).toBe("333 m");
  });
});

describe("isAmbiguousSuffix", () => {
  it("flags a bare M, which is read as milli", () => {
    expect(isAmbiguousSuffix("1M")).toBe(true);
    expect(isAmbiguousSuffix("10m")).toBe(true);
  });

  it("does not flag MEG, which is unambiguous", () => {
    expect(isAmbiguousSuffix("1MEG")).toBe(false);
    expect(isAmbiguousSuffix("1meg")).toBe(false);
  });

  it("does not flag other suffixes", () => {
    expect(isAmbiguousSuffix("1k")).toBe(false);
    expect(isAmbiguousSuffix("10u")).toBe(false);
  });

  it("does not flag a plain number", () => {
    expect(isAmbiguousSuffix("1000")).toBe(false);
  });

  it("does not flag something unparseable", () => {
    expect(isAmbiguousSuffix("abc")).toBe(false);
  });
});

describe("looksNumeric", () => {
  it("recognises text meant as a number", () => {
    expect(looksNumeric("10u")).toBe(true);
    expect(looksNumeric("-2.5k")).toBe(true);
    expect(looksNumeric(".5")).toBe(true);
    expect(looksNumeric("10x")).toBe(true);
  });

  it("does not claim an expression or reference", () => {
    expect(looksNumeric("{Rload}")).toBe(false);
    expect(looksNumeric("Vin*2")).toBe(false);
    expect(looksNumeric("DEFAULT")).toBe(false);
  });
});

/**
 * A parameter may legitimately hold an expression — `{Rload}` — so
 * unparseable text cannot simply be refused. But `10x` is not an
 * expression; it is a number with a suffix the solver does not know, and
 * storing it as text means a run fails later with something unhelpful
 * instead of the field declining now.
 */
describe("paramValueFrom", () => {
  it("stores a number when the text is one", () => {
    expect(paramValueFrom("2.2k")).toBe(2200);
    expect(paramValueFrom("1MEG")).toBe(1e6);
  });

  it("keeps an expression as written", () => {
    expect(paramValueFrom("{Rload}")).toBe("{Rload}");
    expect(paramValueFrom("Vin*2")).toBe("Vin*2");
  });

  it("refuses a malformed number, so the stored value survives", () => {
    expect(paramValueFrom("10x")).toBeNull();
    expect(paramValueFrom("5q")).toBeNull();
  });

  /** The inconsistency this replaces: same field, two stored types. */
  it("stores the same type whether or not a suffix was used", () => {
    expect(typeof paramValueFrom("2200")).toBe("number");
    expect(typeof paramValueFrom("2.2k")).toBe("number");
  });
});
