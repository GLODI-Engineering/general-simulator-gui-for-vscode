import type { BinaryDType, BinaryFramePayload } from "./types";

const HEADER_SIZE = 128;

function constructorFor(
  dtype: BinaryDType,
): typeof Float32Array | typeof Float64Array | typeof Int16Array {
  switch (dtype) {
    case "float32":
      return Float32Array;
    case "float64":
      return Float64Array;
    case "int16":
      return Int16Array;
  }
}

export function encodeBinaryFrame(payload: BinaryFramePayload): ArrayBuffer {
  const header = JSON.stringify({ dtype: payload.dtype, shape: payload.shape });
  if (header.length > HEADER_SIZE) {
    throw new Error("Binary header exceeds 128 bytes");
  }
  const encoder = new TextEncoder();
  const encodedHeader = encoder.encode(header.padEnd(HEADER_SIZE, " "));
  const body = new Uint8Array(
    payload.data.buffer.slice(
      payload.data.byteOffset,
      payload.data.byteOffset + payload.data.byteLength,
    ),
  );
  const frame = new Uint8Array(HEADER_SIZE + body.byteLength);
  frame.set(encodedHeader, 0);
  frame.set(body, HEADER_SIZE);
  return frame.buffer;
}

export function decodeBinaryFrame(frame: ArrayBuffer): BinaryFramePayload {
  const bytes = new Uint8Array(frame);
  const headerText = new TextDecoder().decode(bytes.slice(0, HEADER_SIZE)).trim();
  const header = JSON.parse(headerText) as { dtype: BinaryDType; shape: number[] };
  const BodyArray = constructorFor(header.dtype);
  const body = frame.slice(HEADER_SIZE);
  const data = new BodyArray(body) as BinaryFramePayload["data"];
  return {
    dtype: header.dtype,
    shape: header.shape,
    data,
  };
}

export const encode = encodeBinaryFrame;
export const decode = decodeBinaryFrame;
