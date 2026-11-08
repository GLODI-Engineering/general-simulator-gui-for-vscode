import { describe, expect, it } from "vitest";

import { wheelZoomFactor } from "./axes-config";

/**
 * The chart used a fixed `1 / 0.85` per wheel event — 17.6% per notch, with
 * `deltaY`'s magnitude thrown away. Escaping a 0.3 ms window on a 250 ms run
 * took about forty notches, which reads as a plot ignoring the wheel rather
 * than as a slow zoom.
 */
describe("wheelZoomFactor", () => {
  it("zooms out on a downward scroll and in on an upward one", () => {
    expect(wheelZoomFactor(120)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-120)).toBeLessThan(1);
  });

  it("doubles the span on one standard notch", () => {
    expect(wheelZoomFactor(120)).toBeCloseTo(2, 6);
    expect(wheelZoomFactor(-120)).toBeCloseTo(0.5, 6);
  });

  it("reads the magnitude, so a flick differs from a nudge", () => {
    expect(wheelZoomFactor(240)).toBeGreaterThan(wheelZoomFactor(120));
    expect(wheelZoomFactor(30)).toBeLessThan(wheelZoomFactor(120));
  });

  /** Ten small events must equal one large one, or a trackpad and a mouse disagree. */
  it("composes: the same distance in pieces gives the same zoom", () => {
    const whole = wheelZoomFactor(200);
    let pieces = 1;
    for (let i = 0; i < 10; i++) pieces *= wheelZoomFactor(20);
    expect(pieces).toBeCloseTo(whole, 6);
  });

  it("is symmetric, so a scroll and its reverse return where you began", () => {
    expect(wheelZoomFactor(90) * wheelZoomFactor(-90)).toBeCloseTo(1, 9);
  });

  it("understands line and page scroll modes", () => {
    // Firefox reports lines; 7.5 lines is 120px, one notch.
    expect(wheelZoomFactor(7.5, 1)).toBeCloseTo(2, 6);
    expect(wheelZoomFactor(1, 2)).toBeGreaterThan(wheelZoomFactor(1, 1));
  });

  it("will not leap on a single outsized event", () => {
    expect(wheelZoomFactor(100_000)).toBeLessThanOrEqual(4);
    expect(wheelZoomFactor(-100_000)).toBeGreaterThanOrEqual(0.25);
  });

  it("does nothing for a zero or broken delta", () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });

  /** The complaint, as arithmetic: escaping a deep zoom must be a few notches. */
  it("escapes a 0.3 ms window on a 250 ms run in under a dozen notches", () => {
    let span = 0.0003;
    let notches = 0;
    while (span < 0.25 && notches < 100) {
      span *= wheelZoomFactor(120);
      notches++;
    }
    expect(notches).toBeLessThan(12);
  });
});
