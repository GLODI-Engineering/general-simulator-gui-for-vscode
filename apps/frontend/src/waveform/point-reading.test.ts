import { describe, expect, it } from "vitest";

import { formatReading, nearestSampleIndex, pickNearestTrace, readingFor } from "./point-reading";
import type { SignalRef, WaveformSignal } from "./types";

function signal(name: string, time: number[], values: number[]): WaveformSignal {
  return {
    simId: "r",
    name,
    analysis: "tran",
    quantity: "voltage",
    unit: "V",
    domain: "time",
    time: Float64Array.from(time),
    values: Float64Array.from(values),
  };
}
const ref = (name: string, gain?: number): SignalRef =>
  ({ simId: "r", signalName: name, color: "#000", ...(gain ? { gain } : {}) }) as SignalRef;

describe("nearestSampleIndex", () => {
  const t = [0, 1, 2, 3, 4];

  it("finds an exact hit", () => {
    expect(nearestSampleIndex(t, 2)).toBe(2);
  });

  it("rounds to the nearer neighbour", () => {
    expect(nearestSampleIndex(t, 2.4)).toBe(2);
    expect(nearestSampleIndex(t, 2.6)).toBe(3);
  });

  it("clamps outside the range rather than failing", () => {
    expect(nearestSampleIndex(t, -10)).toBe(0);
    expect(nearestSampleIndex(t, 99)).toBe(4);
  });

  it("gives a tie to the earlier sample, so a reading does not flicker", () => {
    expect(nearestSampleIndex(t, 2.5)).toBe(2);
  });

  it("handles the degenerate sizes", () => {
    expect(nearestSampleIndex([], 1)).toBe(-1);
    expect(nearestSampleIndex([7], 1)).toBe(0);
  });

  it("is a binary search, not a scan — a large axis stays exact", () => {
    const big = Float64Array.from({ length: 100_000 }, (_, i) => i * 1e-6);
    expect(nearestSampleIndex(big, 0.05)).toBe(50_000);
  });
});

describe("readingFor", () => {
  /**
   * The rule: report the signal, not the picture. `readingFor` cannot see a
   * ref at all, which is how that is enforced rather than remembered — a
   * gain has no way to reach a reported value.
   */
  it("reports the stored sample", () => {
    const sig = signal("I(L1)", [0, 1, 2], [0, 2, 4]);
    expect(readingFor(sig, 1)?.y).toBe(2);
  });

  it("returns the sample's own x, not the x that was asked for", () => {
    const sig = signal("V(a)", [0, 1, 2], [5, 6, 7]);
    expect(readingFor(sig, 1.2)?.x).toBe(1);
  });

  it("has nothing to say about an empty signal", () => {
    expect(readingFor(signal("V(a)", [], []), 1)).toBeNull();
  });
});

describe("pickNearestTrace", () => {
  const cache = new Map([
    ["r::low", signal("low", [0, 1, 2], [0, 0, 0])],
    ["r::high", signal("high", [0, 1, 2], [10, 10, 10])],
  ]);
  // Identity pixels, so the test states distances rather than a projection.
  const toPixels = (value: number) => value;

  it("picks the trace the click is closest to", () => {
    const near = pickNearestTrace([ref("low"), ref("high")], cache, 1, 0.4, toPixels as never);
    expect(near?.name).toBe("low");
    const far = pickNearestTrace([ref("low"), ref("high")], cache, 1, 9.6, toPixels as never);
    expect(far?.name).toBe("high");
  });

  it("ignores a signal missing from the cache", () => {
    const got = pickNearestTrace([ref("ghost"), ref("high")], cache, 1, 10, toPixels as never);
    expect(got?.name).toBe("high");
  });

  it("has nothing to say when nothing is cached", () => {
    expect(pickNearestTrace([ref("ghost")], cache, 1, 0, toPixels as never)).toBeNull();
  });
});

describe("formatReading", () => {
  it("carries the name, the x and the value", () => {
    const line = formatReading({ name: "V(out)", index: 3, x: 0.002, y: 48 }, "s", "V");
    expect(line.split("\t")[0]).toBe("V(out)");
    expect(line).toContain("V");
    expect(line.split("\t")).toHaveLength(3);
  });

  /** One frequency has two answers; quoting one is how a margin gets misread. */
  it("carries magnitude and phase for a Bode reading", () => {
    const line = formatReading({ name: "H", index: 1, x: 1000, y: -3, phase: -45 }, "Hz", "dB");
    expect(line.split("\t")).toHaveLength(4);
    expect(line).toContain("-45");
  });

  it("is tab-separated, so it pastes into a spreadsheet as columns", () => {
    const line = formatReading({ name: "V(a)", index: 0, x: 1, y: 2 }, "s", "V");
    expect(line).not.toContain(",");
    expect(line.split("\t").length).toBeGreaterThan(2);
  });
});
