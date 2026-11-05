import { describe, expect, it } from "vitest";
import { decodeWaveformChunkFrame } from "./waveform-chunk-frame";

const HEADER_SIZE = 128;

function encodeFrame(
  header: Record<string, unknown>,
  x: number[],
  values: number[],
  headerSize = HEADER_SIZE,
): ArrayBuffer {
  const headerText = JSON.stringify(header).padEnd(headerSize, " ");
  const headerBytes = new TextEncoder().encode(headerText);
  const frame = new Uint8Array(headerSize + x.length * 8 + values.length * 4);
  frame.set(headerBytes, 0);
  new Float64Array(frame.buffer, headerSize, x.length).set(x);
  new Float32Array(frame.buffer, headerSize + x.length * 8, values.length).set(values);
  return frame.buffer;
}

describe("BE-56: decodeWaveformChunkFrame", () => {
  it("round-trips sim_id, signal_id, x, and values", () => {
    const frame = encodeFrame(
      { type: "waveform_chunk", sim_id: "sim-1", signal_id: "v(out)", n: 3 },
      [0, 1e-6, 2e-6],
      [1.0, 2.0, 3.0],
    );
    const decoded = decodeWaveformChunkFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded?.simId).toBe("sim-1");
    expect(decoded?.signalId).toBe("v(out)");
    expect(Array.from(decoded?.x ?? [])).toEqual([0, 1e-6, 2e-6]);
    expect(Array.from(decoded?.values ?? [])).toEqual([1.0, 2.0, 3.0]);
  });

  it("returns null for frames shorter than the header", () => {
    expect(decodeWaveformChunkFrame(new ArrayBuffer(10))).toBeNull();
  });

  it("returns null for a header that isn't valid JSON", () => {
    const bytes = new Uint8Array(HEADER_SIZE + 8);
    bytes.set(new TextEncoder().encode("not json".padEnd(HEADER_SIZE, " ")), 0);
    expect(decodeWaveformChunkFrame(bytes.buffer)).toBeNull();
  });

  it("returns null for a binary frame of a different type (e.g. workspace value)", () => {
    const frame = encodeFrame({ id: "req-1", dtype: "float32", shape: [2] }, [], []);
    expect(decodeWaveformChunkFrame(frame)).toBeNull();
  });

  it("returns null when the body is shorter than n implies (truncated frame)", () => {
    const frame = encodeFrame(
      { type: "waveform_chunk", sim_id: "sim-1", signal_id: "v(out)", n: 100 },
      [0, 1e-6],
      [1.0, 2.0],
    );
    expect(decodeWaveformChunkFrame(frame)).toBeNull();
  });

  it("handles an empty chunk (n=0)", () => {
    const frame = encodeFrame(
      { type: "waveform_chunk", sim_id: "sim-1", signal_id: "v(out)", n: 0 },
      [],
      [],
    );
    const decoded = decodeWaveformChunkFrame(frame);
    expect(decoded?.x.length).toBe(0);
    expect(decoded?.values.length).toBe(0);
  });
});
