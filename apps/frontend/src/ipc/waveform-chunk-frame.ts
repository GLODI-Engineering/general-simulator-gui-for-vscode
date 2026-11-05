/**
 * Decoder for the binary waveform_chunk wire frame (BE-56).
 *
 * Frame layout (matches kernel_sidecar.ipc.envelope.encode_waveform_chunk_frame):
 *   128-byte JSON header (space-padded) + x bytes (float64) + values bytes (float32).
 * Header: {type: "waveform_chunk", sim_id, signal_id, n}.
 *
 * Replaces the JSON-encoded waveform_chunk payload used through BE-54 —
 * profiling showed JSON-encoding large float arrays server-side was the
 * dominant cost of live streaming (61% of wall time on one representative
 * run), and the resulting JSON text was itself 3-5x larger on the wire than
 * the equivalent raw bytes.
 */

const HEADER_SIZE = 128;

export interface WaveformChunkFrame {
  simId: string;
  signalId: string;
  x: Float64Array;
  values: Float32Array;
}

/** Returns null for any ArrayBuffer that isn't a waveform_chunk frame (too short, or a different binary message type) — callers should treat null as "not for me", not as an error. */
export function decodeWaveformChunkFrame(frame: ArrayBuffer): WaveformChunkFrame | null {
  if (frame.byteLength < HEADER_SIZE) return null;

  const headerText = new TextDecoder().decode(frame.slice(0, HEADER_SIZE)).trim();
  let header: { type?: string; sim_id?: string; signal_id?: string; n?: number };
  try {
    header = JSON.parse(headerText) as typeof header;
  } catch {
    return null;
  }

  if (
    header.type !== "waveform_chunk" ||
    typeof header.sim_id !== "string" ||
    typeof header.signal_id !== "string" ||
    typeof header.n !== "number"
  ) {
    return null;
  }

  const n = header.n;
  const xByteLength = n * 8;
  const valuesByteLength = n * 4;
  if (frame.byteLength < HEADER_SIZE + xByteLength + valuesByteLength) return null;

  const x = new Float64Array(frame.slice(HEADER_SIZE, HEADER_SIZE + xByteLength));
  const values = new Float32Array(
    frame.slice(HEADER_SIZE + xByteLength, HEADER_SIZE + xByteLength + valuesByteLength),
  );

  return { simId: header.sim_id, signalId: header.signal_id, x, values };
}
