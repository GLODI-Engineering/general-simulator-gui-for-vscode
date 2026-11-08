import { describe, expect, it } from "vitest";

import {
  MIN_TRACK_PX,
  defaultSizes,
  normalizeSizes,
  resizeTracks,
  trackTemplate,
} from "./grid-sizing";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("defaultSizes", () => {
  it("starts every track equal", () => {
    expect(defaultSizes(3)).toEqual([1, 1, 1]);
    expect(defaultSizes(0)).toEqual([]);
  });
});

/**
 * A figure's row count can change after sizes were stored, so a stale list
 * is adapted rather than discarded — losing a careful split because one row
 * was added would be worse than an approximate one.
 */
describe("normalizeSizes", () => {
  it("fills in when nothing is stored", () => {
    expect(normalizeSizes(undefined, 2)).toEqual([1, 1]);
    expect(normalizeSizes([], 2)).toEqual([1, 1]);
  });

  it("keeps a list that already fits", () => {
    expect(normalizeSizes([2, 1], 2)).toEqual([2, 1]);
  });

  it("trims a list that is too long", () => {
    expect(normalizeSizes([3, 1, 1], 2)).toEqual([3, 1]);
  });

  it("pads a short list with the average, not with 1", () => {
    // Padding with 1 beside tracks of 4 would make the new row a sliver.
    expect(normalizeSizes([4, 4], 3)).toEqual([4, 4, 4]);
  });

  it("ignores junk entries", () => {
    expect(normalizeSizes([Number.NaN, -1, 0], 2)).toEqual([1, 1]);
  });
});

describe("resizeTracks", () => {
  it("moves space from one track to its neighbour", () => {
    const next = resizeTracks([1, 1], 0, 100, 1000);
    expect(next[0]).toBeGreaterThan(1);
    expect(next[1]).toBeLessThan(1);
  });

  it("conserves the total, so other tracks do not shift", () => {
    const before = [1, 1, 1];
    const after = resizeTracks(before, 0, 120, 900);
    expect(sum(after)).toBeCloseTo(sum(before), 9);
    expect(after[2]).toBe(before[2]);
  });

  it("drags the other way too", () => {
    const next = resizeTracks([1, 1], 0, -100, 1000);
    expect(next[0]).toBeLessThan(1);
    expect(next[1]).toBeGreaterThan(1);
  });

  /** Dragging past the edge stops at the limit rather than inverting. */
  it("never collapses a track below the minimum", () => {
    const next = resizeTracks([1, 1], 0, 100_000, 1000);
    const pairPx = 1000;
    const perFraction = pairPx / sum(next);
    expect((next[1] as number) * perFraction).toBeGreaterThanOrEqual(MIN_TRACK_PX - 1);
  });

  it("never produces a negative track", () => {
    for (const delta of [-99999, -500, 500, 99999]) {
      for (const n of resizeTracks([1, 1, 1], 1, delta, 900)) {
        expect(n).toBeGreaterThan(0);
      }
    }
  });

  it("does nothing when there is no room to move", () => {
    // Two tracks sharing 100px cannot both stay above a 120px minimum.
    expect(resizeTracks([1, 1], 0, 50, 100)).toEqual([1, 1]);
  });

  /**
   * The floor must be the one the CSS enforces. With a different one the
   * drag lags the pointer: the arithmetic reassigns the space and
   * `minmax()` quietly clamps it back.
   */
  it("honours the caller's minimum, not only its own default", () => {
    const roomy = resizeTracks([1, 1], 0, 200, 1000, 120);
    const tight = resizeTracks([1, 1], 0, 200, 1000, 400);
    expect(roomy[0] as number).toBeGreaterThan(tight[0] as number);
  });

  it("refuses to move at all when the caller's minimum leaves no slack", () => {
    expect(resizeTracks([1, 1], 0, 100, 1000, 500)).toEqual([1, 1]);
  });

  it("does nothing for an index with no neighbour", () => {
    expect(resizeTracks([1, 1], 1, 50, 1000)).toEqual([1, 1]);
    expect(resizeTracks([1], 0, 50, 1000)).toEqual([1]);
  });

  it("does nothing without a measured length", () => {
    expect(resizeTracks([1, 1], 0, 50, 0)).toEqual([1, 1]);
  });
});

describe("trackTemplate", () => {
  it("interleaves splitter tracks between the content tracks", () => {
    expect(trackTemplate([1, 2], 260, 6)).toBe("minmax(260px, 1fr) 6px minmax(260px, 2fr)");
  });

  it("has no splitter for a single track", () => {
    expect(trackTemplate([1], 260, 6)).toBe("minmax(260px, 1fr)");
  });
});
