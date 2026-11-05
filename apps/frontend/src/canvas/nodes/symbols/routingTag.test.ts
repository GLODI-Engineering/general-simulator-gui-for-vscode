import { describe, expect, it } from "vitest";

import { wireColorForDomain } from "../../edges/wire-color";
import { findDrawing } from "./registry";
import { fromDrawing, gotoDrawing } from "./routingTag";

const ctx = (params: Record<string, unknown>) => ({ params }) as never;

/**
 * Goto/From let a sheet carry a signal without drawing a wire across it.
 * Both fell back to a blank rectangle, which defeats the point: the value
 * of a tag is reading where a signal goes without following a line, and a
 * tag you cannot read is not a tag.
 */
describe("routing tags", () => {
  it("both are registered", () => {
    expect(findDrawing("routing.goto")).toBe(gotoDrawing);
    expect(findDrawing("routing.from")).toBe(fromDrawing);
  });

  it("puts the tag name on the symbol", () => {
    const markup = JSON.stringify(gotoDrawing.draw(ctx({ tag: "PH_A" })));
    expect(markup).toContain("PH_A");
  });

  it("shows a placeholder rather than nothing when the tag is unset", () => {
    // An unnamed tag cannot resolve, and a blank flag hides that.
    for (const drawing of [gotoDrawing, fromDrawing]) {
      expect(JSON.stringify(drawing.draw(ctx({})))).toContain("?");
      expect(JSON.stringify(drawing.draw(ctx({ tag: "   " })))).toContain("?");
    }
  });

  it("draws the two ends of a link as different shapes", () => {
    // At a glance the shape must say which end you are looking at, before
    // you have read the name.
    const g = JSON.stringify(gotoDrawing.draw(ctx({ tag: "X" })));
    const f = JSON.stringify(fromDrawing.draw(ctx({ tag: "X" })));
    expect(g).not.toBe(f);
  });

  it("uses the signal colour, because these are signal-domain only", () => {
    // An acausal physical net has no "from" end; a tag carrying one would
    // assert a direction the equations do not have.
    const markup = JSON.stringify(gotoDrawing.draw(ctx({ tag: "X" })));
    expect(markup).toContain(wireColorForDomain("signal"));
  });
});
