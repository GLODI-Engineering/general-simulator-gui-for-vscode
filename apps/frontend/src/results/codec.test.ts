import { describe, expect, it } from "vitest";

import { READABLE_SAMPLE_LIMIT, decodeSamples, encodeSamples, encodingFor } from "./codec";
import type { GsimSimResultVector } from "./types";

function vector(partial: Partial<GsimSimResultVector>): GsimSimResultVector {
  return { name: "V(out)", unit: "V", encoding: "f64-base64", data: "", ...partial };
}

describe("f64-base64 round trip", () => {
  it("is exact, not merely close", () => {
    // The point of the encoding. A result that does not come back
    // bit-for-bit cannot be used to check an engine against a reference —
    // the disagreement being measured is often smaller than the error a
    // decimal round trip introduces.
    const values = Float64Array.from([
      0,
      -0,
      1,
      -1,
      0.1,
      1 / 3,
      Math.PI,
      1e-300,
      1e300,
      Number.MIN_VALUE,
      Number.MAX_VALUE,
      Number.EPSILON,
    ]);
    const encoded = encodeSamples(values, "f64-base64");
    const decoded = decodeSamples(vector({ encoding: "f64-base64", data: encoded }));
    expect(Array.from(decoded)).toEqual(Array.from(values));
  });

  it("preserves the sign of negative zero", () => {
    const decoded = decodeSamples(
      vector({ data: encodeSamples(Float64Array.from([-0]), "f64-base64") }),
    );
    expect(Object.is(decoded[0], -0)).toBe(true);
  });

  it("carries the non-finite values a diverging solve produces", () => {
    const values = Float64Array.from([
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]);
    const decoded = decodeSamples(vector({ data: encodeSamples(values, "f64-base64") }));
    expect(Number.isNaN(decoded[0] as number)).toBe(true);
    expect(decoded[1]).toBe(Number.POSITIVE_INFINITY);
    expect(decoded[2]).toBe(Number.NEGATIVE_INFINITY);
  });

  it("handles an array past the fromCharCode argument limit", () => {
    // String.fromCharCode(...bytes) over a multi-megabyte array throws
    // RangeError; 200k doubles is 1.6 MB of bytes, well past it.
    const values = new Float64Array(200_000);
    for (let i = 0; i < values.length; i++) values[i] = Math.sin(i);
    const decoded = decodeSamples(vector({ data: encodeSamples(values, "f64-base64") }));
    expect(decoded.length).toBe(values.length);
    expect(decoded[199_999]).toBe(values[199_999]);
  });

  it("is smaller than decimal text for real samples", () => {
    const values = new Float64Array(5000);
    for (let i = 0; i < values.length; i++) values[i] = Math.sin(i / 7) * 48;
    const base64 = (encodeSamples(values, "f64-base64") as string).length;
    const json = JSON.stringify(Array.from(values)).length;
    expect(base64).toBeLessThan(json);
  });
});

describe("json encoding", () => {
  it("round trips as plain numbers", () => {
    const encoded = encodeSamples([1, 2, 3.5], "json");
    expect(encoded).toEqual([1, 2, 3.5]);
    expect(Array.from(decodeSamples(vector({ encoding: "json", data: encoded })))).toEqual([
      1, 2, 3.5,
    ]);
  });
});

describe("decodeSamples rejects what it cannot read", () => {
  it("names the signal when the data does not match its declared encoding", () => {
    expect(() => decodeSamples(vector({ name: "I(L1)", encoding: "json", data: "nope" }))).toThrow(
      /I\(L1\)/,
    );
    expect(() =>
      decodeSamples(vector({ name: "I(L1)", encoding: "f64-base64", data: [1, 2] })),
    ).toThrow(/I\(L1\)/);
  });

  it("rejects a byte length that is not a whole number of doubles", () => {
    // Truncation has to fail here. Downstream it is invisible: the viewer
    // just plots every y against the wrong x.
    expect(() => decodeSamples(vector({ data: "AAAAAAAA" + "AA" }))).toThrow(/whole number/);
  });

  it("rejects data that is not base64 at all", () => {
    expect(() => decodeSamples(vector({ data: "not base64 !!!" }))).toThrow(/base64/);
  });
});

describe("encodingFor", () => {
  it("keeps a short result readable and switches the rest to bytes", () => {
    expect(encodingFor(10)).toBe("json");
    expect(encodingFor(READABLE_SAMPLE_LIMIT)).toBe("json");
    expect(encodingFor(READABLE_SAMPLE_LIMIT + 1)).toBe("f64-base64");
  });
});
