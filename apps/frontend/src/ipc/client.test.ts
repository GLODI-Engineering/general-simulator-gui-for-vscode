/**
 * FE-31: IPC client tests
 *
 * Acceptance:
 * - Fake WebSocket delivers streamed execute_stream then execute_result; client assembles correctly.
 * - Binary frame round-trip preserves dtype, shape, byte content.
 * - Cancel resolves Promise with CancelledError.
 */

import { describe, expect, it } from "vitest";
import { useIpcStore } from "../store/ipc";
import { decodeBinaryFrame, encodeBinaryFrame } from "./binary-frame";
import { createIPCClient } from "./client";

/** Mirrors kernel_sidecar.ipc.envelope.encode_waveform_chunk_frame (BE-56). */
function encodeWaveformChunkFrame(
  simId: string,
  signalId: string,
  x: number[],
  values: number[],
): ArrayBuffer {
  const HEADER_SIZE = 128;
  const header = JSON.stringify({
    type: "waveform_chunk",
    sim_id: simId,
    signal_id: signalId,
    n: x.length,
  });
  const headerBytes = new TextEncoder().encode(header.padEnd(HEADER_SIZE, " "));
  const frame = new Uint8Array(HEADER_SIZE + x.length * 8 + values.length * 4);
  frame.set(headerBytes, 0);
  new Float64Array(frame.buffer, HEADER_SIZE, x.length).set(x);
  new Float32Array(frame.buffer, HEADER_SIZE + x.length * 8, values.length).set(values);
  return frame.buffer;
}

describe("simulate_progress race regression", () => {
  it("does not leave simProgress stuck after a caller clears it post-resolve", async () => {
    // Reproduces the pre-fix bug: simulate_progress was applied via a
    // dynamic import().then() (deferred a microtask), while simulate_result
    // resolved execute() synchronously. If both messages arrive back to
    // back — the common case for a fast solve, where _run_with_heartbeat
    // emits frac=1.0 immediately before the result — the caller's own
    // post-resolve setSimProgress(null) (what triggerRun does) could run
    // *before* the deferred progress update, which then landed afterward
    // and left the toolbar stuck showing "Solving…" indefinitely.
    class FakeWS {
      onmessage: ((e: { data: string }) => void) | null = null;
      send(raw: string) {
        const msg = JSON.parse(raw);
        const id = msg.id;
        // Deliver both messages in the same tick, progress before result —
        // exactly the order _run_with_heartbeat + the simulate handler use.
        this.onmessage?.({
          data: JSON.stringify({
            id,
            type: "simulate_progress",
            payload: { frac: 1.0, message: "Solving…" },
          }),
        });
        this.onmessage?.({
          data: JSON.stringify({
            id,
            type: "simulate_result",
            payload: { status: "ok", sim_id: "s1", signals: [] },
          }),
        });
      }
      close() {}
    }

    useIpcStore.setState({ simProgress: null, simMessage: null });
    const client = createIPCClient({ wsFactory: () => new FakeWS() as unknown as WebSocket });

    await client.execute({ type: "simulate", netlist: "* noop\n.end\n" });
    // What triggerRun does immediately after execute() resolves.
    useIpcStore.getState().setSimProgress(null);

    // Flush any pending microtasks/timers a stale deferred handler would
    // have used to apply its (now stale) update.
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();

    expect(useIpcStore.getState().simProgress).toBeNull();
  });
});

function buildNpyFloat32(values: number[]): ArrayBuffer {
  let header = `{'descr': '<f4', 'fortran_order': False, 'shape': (${values.length},), }`;
  const prefixLen = 10; // 6-byte magic + 2-byte version + 2-byte header-len
  const pad = (64 - ((prefixLen + header.length + 1) % 64)) % 64;
  header += `${" ".repeat(pad)}\n`;
  const headerLen = header.length;
  const buf = new ArrayBuffer(prefixLen + headerLen + values.length * 4);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59].forEach((b, i) => {
    bytes[i] = b;
  });
  bytes[6] = 1; // major version
  bytes[7] = 0; // minor version
  view.setUint16(8, headerLen, true);
  for (let i = 0; i < headerLen; i++) bytes[10 + i] = header.charCodeAt(i);
  const dataOffset = prefixLen + headerLen;
  values.forEach((v, i) => view.setFloat32(dataOffset + i * 4, v, true));
  return buf;
}

describe("waveformGet BE-47 metadata regression", () => {
  it("carries analysis/quantity/unit/domain from the simulate_result payload through to waveformGet", async () => {
    // Reproduces the pre-fix bug: the simulate_result handler pre-warmed
    // manifestCache from the WS payload using only {name, url}, discarding
    // analysis/quantity/unit/domain. waveformGet() only fetches manifest.json
    // over HTTP when the cache is empty, so with the cache pre-warmed this
    // way, every signal — AC, DC, NOISE, whatever — silently reported back
    // as if it had no BE-47 metadata at all, which is exactly what
    // store/waveform.ts's fetchSignal() falls back to "transient"/
    // "dimensionless"/"time" for. That broke Bode-mode axis labeling
    // ("Frequency (Hz)" showed as "Time (s)") for every AC run.
    class FakeWS {
      onmessage: ((e: { data: string }) => void) | null = null;
      send(raw: string) {
        const msg = JSON.parse(raw);
        this.onmessage?.({
          data: JSON.stringify({
            id: msg.id,
            type: "simulate_result",
            payload: {
              status: "ok",
              sim_id: "sim-ac",
              t_start: 1000,
              t_end: 100000,
              signals: [
                {
                  name: "v(out)",
                  url: "/results/sim-ac/signals/spice__out.npy",
                  analysis: "ac_mag",
                  quantity: "voltage",
                  unit: "V",
                  domain: "frequency",
                },
              ],
            },
          }),
        });
      }
      close() {}
    }

    const client = createIPCClient({ wsFactory: () => new FakeWS() as unknown as WebSocket });
    await client.execute({ type: "simulate", netlist: "* ac\n.ac dec 10 1k 1meg\n.end\n" });

    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      return new Response(buildNpyFloat32([0.5]), { status: 200 });
    }) as typeof fetch;

    try {
      const slice = await client.waveformGet("sim-ac", ["v(out)"]);
      const trace = slice.traces[0];

      expect(trace?.analysis).toBe("ac_mag");
      expect(trace?.quantity).toBe("voltage");
      expect(trace?.unit).toBe("V");
      expect(trace?.domain).toBe("frequency");
      // manifestCache was pre-warmed from the WS payload — only the .npy
      // itself should need an HTTP fetch, no manifest.json round-trip.
      expect(fetchCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("BE-56: waveform_chunk live streaming (binary frame)", () => {
  it("decodes the binary waveform_chunk frame and passes x through to the waveform store", async () => {
    class FakeWS {
      binaryType = "arraybuffer";
      onmessage: ((e: { data: string | ArrayBuffer }) => void) | null = null;
      send(raw: string) {
        const msg = JSON.parse(raw);
        this.onmessage?.({
          data: encodeWaveformChunkFrame("sim-live", "v(out)", [0, 1e-6], [1.0, 2.0]),
        });
        this.onmessage?.({
          data: JSON.stringify({
            id: msg.id,
            type: "simulate_result",
            payload: { status: "ok", sim_id: "sim-live", signals: [] },
          }),
        });
      }
      close() {}
    }

    const client = createIPCClient({ wsFactory: () => new FakeWS() as unknown as WebSocket });
    await client.execute({ type: "simulate", netlist: "* tran\n.tran 1u 2u\n.end\n" });

    // appendChunk is dispatched via a deferred import() — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    const { useWaveformStore } = await import("../store/waveform");
    const cached = useWaveformStore.getState().signalCache.get("sim-live::v(out)");
    expect(Array.from(cached?.time ?? [])).toEqual([0, 1e-6]);
    expect(Array.from(cached?.values ?? [])).toEqual([1.0, 2.0]);
  });

  it("FE-154: registers the signal in the ipc store's live manifest, before simulate_result arrives", async () => {
    const { useIpcStore } = await import("../store/ipc");
    useIpcStore.setState({ lastManifest: null });

    class FakeWS {
      binaryType = "arraybuffer";
      onmessage: ((e: { data: string | ArrayBuffer }) => void) | null = null;
      send(raw: string) {
        const msg = JSON.parse(raw);
        // Send the chunk but deliberately never send simulate_result in
        // this test — the manifest must already be populated from the
        // chunk alone, not depend on the run finishing.
        this.onmessage?.({
          data: encodeWaveformChunkFrame("sim-live-2", "v(out)", [0, 1e-6], [1.0, 2.0]),
        });
        void msg;
      }
      close() {}
    }

    const client = createIPCClient({ wsFactory: () => new FakeWS() as unknown as WebSocket });
    void client.execute({ type: "simulate", netlist: "* tran\n.tran 1u 2u\n.end\n" });

    // registerLiveSignal is dispatched via a deferred import() — flush it.
    await new Promise((r) => setTimeout(r, 0));

    expect(useIpcStore.getState().lastManifest).toEqual({
      sim_id: "sim-live-2",
      signals: ["v(out)"],
      t_start: 0,
      t_end: 0,
    });
  });
});

describe("FE-31: IPC client", () => {
  it("execute assembles streamed chunks into result", async () => {
    // Fake WebSocket that sends stream chunks then a result
    class FakeWS {
      onmessage: ((e: { data: string }) => void) | null = null;
      send(_: string) {
        const msg = JSON.parse(_);
        const id = msg.id;
        setTimeout(() => {
          this.onmessage?.({
            data: JSON.stringify({ id, type: "execute_stream", chunk: "line1\n" }),
          });
          this.onmessage?.({
            data: JSON.stringify({ id, type: "execute_stream", chunk: "line2\n" }),
          });
          this.onmessage?.({
            data: JSON.stringify({
              id,
              type: "execute_result",
              result: { status: "ok", manifest: {} },
            }),
          });
        }, 0);
      }
      close() {}
    }

    const client = createIPCClient?.({ wsFactory: () => new FakeWS() as unknown as WebSocket });
    const result = await client.execute("print('hi')");
    expect(result.status).toBe("ok");
    expect(result.chunks).toEqual(["line1\n", "line2\n"]);
  });

  it("cancel resolves with CancelledError", async () => {
    class SlowWS {
      onmessage: ((e: { data: string }) => void) | null = null;
      send(_: string) {
        /* never responds */
      }
      close() {}
    }
    const client = createIPCClient({ wsFactory: () => new SlowWS() as unknown as WebSocket });
    const promise = client.execute("import time; time.sleep(999)");
    await new Promise((r) => setTimeout(r, 0));
    client.cancel(/* id from promise */);
    const err = await promise.catch((e: Error) => e);
    expect(err?.name ?? err?.message ?? String(err)).toMatch(/cancel/i);
  });
});

describe("FE-151: WebSocket failure surfaces as an error instead of hanging forever", () => {
  it("execute() rejects if the socket never opens (onerror fires before handshake)", async () => {
    class NeverOpensWS {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      send() {
        throw new Error("send() should never be reached — socket never opened");
      }
      close() {}
      constructor() {
        // Simulate a real browser WebSocket: connection fails asynchronously.
        setTimeout(() => this.onerror?.(), 0);
      }
    }

    const client = createIPCClient({ wsFactory: () => new NeverOpensWS() as unknown as WebSocket });
    await expect(client.execute({ type: "simulate", netlist: "* noop\n.end\n" })).rejects.toThrow();
  });

  it("a mid-session disconnect rejects any request already in flight instead of hanging it forever", async () => {
    class DropsAfterOpenWS {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      sendCount = 0;
      send() {
        this.sendCount += 1;
        // First send() is the handshake — let it succeed silently. Only the
        // real execute request (the second send) triggers the drop, so this
        // exercises rejecting an already-in-flight pending request, not just
        // readyPromise never resolving.
        if (this.sendCount === 1) return;
        setTimeout(() => this.onclose?.({ code: 1006 }), 0);
      }
      close() {}
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
    }

    const client = createIPCClient({
      wsFactory: () => new DropsAfterOpenWS() as unknown as WebSocket,
    });
    await expect(client.execute({ type: "simulate", netlist: "* noop\n.end\n" })).rejects.toThrow();
  });
});

describe("handshake-ack race: readyPromise must resolve via the fast kernel_status path, not only the 200ms fallback", () => {
  it("execute() proceeds as soon as the server's handshake-ack (kernel_status) arrives, without waiting out the 200ms fallback timer", async () => {
    // Reproduces a real bug reported live: the WebSocket "Messages" panel
    // showed only periodic `ping` frames, never a `simulate` frame — every
    // execute() call was stuck forever at `await readyPromise`, before ever
    // reaching socket.send() for the actual request.
    //
    // Root cause: handshake.py replies to the client's handshake with
    // kernel_status {state:"idle"} immediately — essentially always well
    // under 200ms on a local loopback connection. The onmessage handler for
    // kernel_status set the handshakeDone flag directly instead of calling
    // the same resolve() the 200ms fallback timer uses — so by the time
    // that timer checked `!handshakeDone`, it was already true and its own
    // resolve() call was skipped too. Net effect: readyPromise essentially
    // never resolved through any path on the fast/common case.
    class FastHandshakeWS {
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      sendCount = 0;
      send(raw: string) {
        this.sendCount += 1;
        if (this.sendCount === 1) {
          // Handshake — reply immediately, mirroring the real server.
          this.onmessage?.({
            data: JSON.stringify({
              id: "handshake",
              type: "kernel_status",
              payload: { state: "idle" },
            }),
          });
          return;
        }
        // Second send() is the real "simulate" request.
        const msg = JSON.parse(raw) as { id: string };
        this.onmessage?.({
          data: JSON.stringify({
            id: msg.id,
            type: "simulate_result",
            payload: { status: "ok", sim_id: "s1", signals: [] },
          }),
        });
      }
      close() {}
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
    }

    const client = createIPCClient({
      wsFactory: () => new FastHandshakeWS() as unknown as WebSocket,
    });

    const result = await Promise.race([
      client.execute({ type: "simulate", netlist: "* noop\n.end\n" }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("execute() did not resolve — readyPromise is stuck")),
          300,
        ),
      ),
    ]);

    expect(result).toMatchObject({ status: "ok" });
  });
});

describe("FE-31: binary-frame", () => {
  it("round-trip preserves dtype, shape, data", () => {
    const input = {
      dtype: "float64" as const,
      shape: [3] as [number],
      data: new Float64Array([1.0, 2.0, 3.0]),
    };
    const encoded = encodeBinaryFrame(input);
    const decoded = decodeBinaryFrame(encoded);
    expect(decoded.dtype).toBe("float64");
    expect(Array.from(decoded.data as Float64Array)).toEqual([1.0, 2.0, 3.0]);
  });
});
