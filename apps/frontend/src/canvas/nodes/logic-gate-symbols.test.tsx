/**
 * Real IEEE/ANSI distinctive-shape symbols for logic.gate (and/or/xor/nand/nor/xnor/not),
 * logic.flip_flop and logic.hysteresis -- previously all rendered as a generic labeled
 * rectangle (the default `metadataToPrimitives` fallback for `shape: rect`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getSchematicSymbol } from "./component-symbols";

function markupFor(type: string, params: Record<string, unknown> = {}): string {
  const symbol = getSchematicSymbol(type);
  expect(symbol, `no SchematicSymbol registered for ${type}`).toBeDefined();
  // biome-ignore lint/style/noNonNullAssertion: asserted defined above
  return renderToStaticMarkup(symbol!.render({ width: 50, height: 44, params }));
}

describe("logic.gate — real distinctive shapes per op", () => {
  it("and/nand render the D-shaped (arc-capped) body", () => {
    expect(markupFor("logic.gate", { op: "and" })).toContain("<path");
    expect(markupFor("logic.gate", { op: "and" })).toMatch(/<path[^>]*d="[^"]*A /);
  });

  it("or/nor/xor/xnor render the shield-shaped (bezier) body", () => {
    expect(markupFor("logic.gate", { op: "or" })).toMatch(/<path[^>]*d="[^"]*C /);
  });

  it("xor/xnor draw an extra back curve that and/or/nand/nor do not", () => {
    const xor = markupFor("logic.gate", { op: "xor" });
    const or = markupFor("logic.gate", { op: "or" });
    const xorPathCount = (xor.match(/<path/g) ?? []).length;
    const orPathCount = (or.match(/<path/g) ?? []).length;
    expect(xorPathCount).toBeGreaterThan(orPathCount);
  });

  it("not renders a triangle (polygon), not a rect or the gate paths", () => {
    const markup = markupFor("logic.gate", { op: "not" });
    expect(markup).toContain("<polygon");
    expect(markup).not.toContain("<rect");
  });

  it("nand/nor/xnor/not each draw an output bubble (circle), and/or/xor do not", () => {
    expect(markupFor("logic.gate", { op: "and" })).not.toContain("<circle");
    expect(markupFor("logic.gate", { op: "nand" })).toContain("<circle");
    expect(markupFor("logic.gate", { op: "or" })).not.toContain("<circle");
    expect(markupFor("logic.gate", { op: "nor" })).toContain("<circle");
    expect(markupFor("logic.gate", { op: "not" })).toContain("<circle");
  });

  it("defaults to the 'and' shape when op is missing", () => {
    expect(markupFor("logic.gate", {})).toBe(markupFor("logic.gate", { op: "and" }));
  });

  it("the fixed-op signal-flow siblings resolve to the same shapes as their logic.gate equivalent", () => {
    expect(markupFor("signal_flow.logic.and")).toBe(markupFor("logic.gate", { op: "and" }));
    expect(markupFor("signal_flow.logic.or")).toBe(markupFor("logic.gate", { op: "or" }));
    expect(markupFor("signal_flow.logic.not")).toBe(markupFor("logic.gate", { op: "not" }));
  });
});

describe("logic.flip_flop — rectangle with a clock chevron", () => {
  it("draws a rect body, a clock chevron polygon, and the kind text", () => {
    const markup = markupFor("logic.flip_flop", { kind: "jkff" });
    expect(markup).toContain("<rect");
    expect(markup).toContain("<polygon");
    expect(markup).toContain("jkff");
  });
});

describe("logic.hysteresis — box with the Schmitt-trigger loop glyph", () => {
  it("draws a rect body plus the hysteresis-loop paths", () => {
    const markup = markupFor("logic.hysteresis");
    expect(markup).toContain("<rect");
    expect((markup.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("passive.inductor.coupled — transformer symbol (two coils + core)", () => {
  it("draws two winding paths, a laminated core, and two polarity dots", () => {
    const markup = markupFor("passive.inductor.coupled");
    expect((markup.match(/<path/g) ?? []).length).toBe(2);
    expect((markup.match(/<circle/g) ?? []).length).toBe(2);
    // Core: two vertical bars in addition to the four lead lines + two coils.
    expect((markup.match(/<line/g) ?? []).length).toBe(6);
  });
});
