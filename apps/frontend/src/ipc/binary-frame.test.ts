/**
 * FE-31: binary-frame separate test file
 */

import { describe, expect, it } from "vitest";
import { decodeBinaryFrame, encodeBinaryFrame } from "./binary-frame";

describe("FE-31: binary-frame", () => {
  it("128-byte header is prepended", () => {
    const frame = encodeBinaryFrame({
      dtype: "float32",
      shape: [2],
      data: new Float32Array([1, 2]),
    });
    expect(frame.byteLength).toBeGreaterThanOrEqual(128);
  });

  it("round-trips float32 array", () => {
    const frame = encodeBinaryFrame({
      dtype: "float32",
      shape: [4],
      data: new Float32Array([0, 1, -1, 0.5]),
    });
    const decoded = decodeBinaryFrame(frame);
    expect(decoded.dtype).toBe("float32");
    expect(decoded.shape).toEqual([4]);
  });

  it("round-trips int16 array", () => {
    const frame = encodeBinaryFrame({
      dtype: "int16",
      shape: [3],
      data: new Int16Array([100, -200, 300]),
    });
    const decoded = decodeBinaryFrame(frame);
    expect(Array.from(decoded.data as Int16Array)).toEqual([100, -200, 300]);
  });
});
