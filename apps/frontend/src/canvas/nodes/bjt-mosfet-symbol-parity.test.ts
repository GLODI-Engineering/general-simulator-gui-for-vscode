import { describe, expect, it } from "vitest";

import { findDrawing } from "./symbols/registry";

/**
 * This file used to assert that the BJT and MOSFET *metadata primitives*
 * matched a *hardcoded* symbol, radius for radius (FE-171).
 *
 * Both sides of that comparison are now superseded. The artwork lives in
 * `symbols/`, one file per component, and the metadata carries no drawing at
 * all — its primitives were authored for an 80x110 box, and when the symbols
 * were redrawn to 60x60 they would have overflowed it. Two descriptions of
 * one drawing is exactly how they drift apart, so the stale one was removed
 * rather than rescaled.
 *
 * What is worth asserting now is that these types resolve to artwork at all:
 * a transistor silently falling through to the generic renderer draws as a
 * white box with its type name across it, which is what the whole symbols/
 * directory exists to prevent.
 */
describe("transistor artwork resolves", () => {
  const TYPES = [
    "semi.mosfet.n",
    "semi.mosfet.p",
    "physical_electrical.semiconductor.mosfet_n",
    "physical_electrical.semiconductor.mosfet_p",
    "semi.bjt.npn",
    "semi.bjt.pnp",
    "physical_electrical.semiconductor.bjt_npn",
    "physical_electrical.semiconductor.bjt_pnp",
    "semi.jfet.n",
    "semi.jfet.p",
  ];

  for (const type of TYPES) {
    it(`${type} has a drawing`, () => {
      expect(findDrawing(type)).toBeDefined();
    });
  }

  it("an unregistered type has none, so the fallback still applies", () => {
    expect(findDrawing("not.a.real.type")).toBeUndefined();
  });
});
