/**
 * Reading and writing the sample arrays inside a `.gsim_sim_result_result` file.
 *
 * ## Why base64 doubles rather than JSON numbers
 *
 * A result is derived numeric data, and two properties matter that do not
 * matter for a schematic:
 *
 * - **Exactness.** `JSON.stringify(0.1 + 0.2)` is lossless in V8, but a file
 *   written by another tool at "reasonable" precision is not, and a result
 *   that does not round-trip bit-for-bit cannot be used to check an engine
 *   against a reference. `f64-base64` is the bytes, so a round trip is the
 *   identity.
 * - **Size.** A double costs 10.67 base64 characters against roughly 20 for
 *   decimal text. A 25,000-step run of 11 signals is 2.9 MB rather than
 *   5.6 MB.
 *
 * `json` encoding stays available for a short result someone wants to read
 * or diff by eye. The reader accepts both; the writer picks, defaulting to
 * base64 above a threshold where readability stops being realistic anyway.
 */
import type { GsimSimResultVector, SampleEncoding } from "./types";

/** Above this many samples, a human is not reading the array anyway. */
export const READABLE_SAMPLE_LIMIT = 256;

const LITTLE_ENDIAN = (() => {
  // Float64Array views use the platform's byte order, so on the (vanishingly
  // rare, but real) big-endian host a direct view would silently reverse
  // every value. Check once; take the fast path when it is safe.
  const probe = new Uint8Array(new Uint16Array([1]).buffer);
  return probe[0] === 1;
})();

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) on a multi-megabyte array blows
  // the argument limit and throws RangeError.
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode samples for the `data` field under `encoding`. */
export function encodeSamples(
  values: Float64Array | number[],
  encoding: SampleEncoding,
): string | number[] {
  if (encoding === "json") {
    return Array.from(values);
  }
  const f64 = values instanceof Float64Array ? values : Float64Array.from(values);
  if (LITTLE_ENDIAN) {
    return bytesToBase64(new Uint8Array(f64.buffer, f64.byteOffset, f64.byteLength));
  }
  const bytes = new Uint8Array(f64.length * 8);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < f64.length; i++) {
    view.setFloat64(i * 8, f64[i] as number, true);
  }
  return bytesToBase64(bytes);
}

/** Decode one vector's samples. Throws with a readable message on bad input. */
export function decodeSamples(vector: GsimSimResultVector): Float64Array {
  const { encoding, data, name } = vector;

  if (encoding === undefined || data === undefined) {
    // A vector with no samples is not a parse failure to be reported at the
    // byte level — it means the document said its data lives elsewhere, and
    // whoever opened it did not supply that. Say which.
    throw new Error(
      `"${name}" carries no inline samples. Its document stores data externally; ` +
        "open it through a source that can read that file.",
    );
  }

  if (encoding === "json") {
    if (!Array.isArray(data)) {
      throw new Error(`"${name}" declares encoding "json" but its data is not an array.`);
    }
    return Float64Array.from(data);
  }

  if (encoding === "f64-base64") {
    if (typeof data !== "string") {
      throw new Error(`"${name}" declares encoding "f64-base64" but its data is not a string.`);
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(data);
    } catch {
      throw new Error(`"${name}" has data that is not valid base64.`);
    }
    if (bytes.length % 8 !== 0) {
      // Catch truncation here rather than handing the viewer a vector one
      // sample short of every other one, which shows up much later as a
      // chart that silently plots the wrong x for every y.
      throw new Error(
        `"${name}" has ${bytes.length} bytes, which is not a whole number of doubles.`,
      );
    }
    if (LITTLE_ENDIAN) {
      return new Float64Array(bytes.buffer, bytes.byteOffset, bytes.length / 8);
    }
    const out = new Float64Array(bytes.length / 8);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    for (let i = 0; i < out.length; i++) {
      out[i] = view.getFloat64(i * 8, true);
    }
    return out;
  }

  throw new Error(`"${name}" uses unknown encoding "${String(encoding)}".`);
}

/** The encoding to write for a vector of this length. */
export function encodingFor(sampleCount: number): SampleEncoding {
  return sampleCount <= READABLE_SAMPLE_LIMIT ? "json" : "f64-base64";
}
