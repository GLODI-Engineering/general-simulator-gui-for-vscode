import { useIpcStore } from "../store/ipc";
import { CancelledError, type ExecuteResult, type IpcClient, type WaveformSlice } from "./types";
import { decodeWaveformChunkFrame } from "./waveform-chunk-frame";

type EventName = "workspace_update" | "kernel_status" | "execute_stream";

type OutboundType = "execute" | "simulate";

interface CreateIPCClientOptions {
  wsFactory?: () => WebSocket;
}

interface PendingExecute {
  id: string;
  type: OutboundType;
  resolve: (value: ExecuteResult) => void;
  reject: (reason?: unknown) => void;
  chunks: string[];
}

interface Envelope {
  id: string;
  type: string;
  payload?: unknown;
  chunk?: string;
  result?: Record<string, unknown>;
  status?: string;
}

type SignalManifestEntry = {
  name: string;
  url: string;
  analysis?: string;
  quantity?: string;
  unit?: string;
  domain?: string;
};

type SimulationManifestDoc = {
  sim_id: string;
  t_start: number;
  t_end: number;
  n_points: number;
  signals: SignalManifestEntry[];
};

function createRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getKernelConfig() {
  const globalWindow = globalThis as unknown as {
    __KERNEL_PORT__?: string | number;
    __KERNEL_TOKEN__?: string;
  };

  const env = import.meta.env as Record<string, string | undefined>;
  const port = globalWindow.__KERNEL_PORT__ ?? env.VITE_KERNEL_PORT ?? 9001;
  const token = globalWindow.__KERNEL_TOKEN__ ?? env.VITE_KERNEL_TOKEN ?? "";

  return { port: String(port), token: String(token) };
}

function defaultWsFactory(): WebSocket {
  const { port } = getKernelConfig();
  return new WebSocket(`ws://127.0.0.1:${port}`);
}

function parseNpyFloatArray(buffer: ArrayBuffer): Float32Array | Float64Array {
  const bytes = new Uint8Array(buffer);
  const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  if (!MAGIC.every((b, i) => bytes[i] === b)) {
    throw new Error("Invalid .npy magic header");
  }

  const major = bytes[6];
  const headerLen =
    major === 1
      ? new DataView(buffer, 8, 2).getUint16(0, true)
      : new DataView(buffer, 8, 4).getUint32(0, true);
  const headerOffset = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(bytes.slice(headerOffset, headerOffset + headerLen));

  const descrMatch = header.match(/'descr':\s*'([^']+)'/);
  if (!descrMatch) throw new Error("Invalid .npy header: missing descr");
  const dtype = descrMatch[1] ?? "";

  const dataOffset = headerOffset + headerLen;
  if (dtype.includes("f8")) {
    return new Float64Array(buffer.slice(dataOffset));
  }
  if (dtype.includes("f4")) {
    return new Float32Array(buffer.slice(dataOffset));
  }
  throw new Error(`Unsupported dtype in .npy: ${dtype}`);
}

export function createIPCClient({
  wsFactory = defaultWsFactory,
}: CreateIPCClientOptions = {}): IpcClient {
  const socket = wsFactory();
  // Binary WebSocket frames (waveform_chunk, BE-56) arrive as Blob by
  // default in browsers, which requires an async .arrayBuffer() read before
  // the bytes can be decoded — "arraybuffer" delivers them synchronously in
  // onmessage instead, matching how the fake sockets used in tests already
  // hand back ArrayBuffer/Uint8Array-like data. Guarded because minimal fake
  // sockets in unit tests may not expose a writable binaryType.
  if ("binaryType" in socket) {
    socket.binaryType = "arraybuffer";
  }
  const pending = new Map<string, PendingExecute>();
  const listeners = new Map<EventName, Set<(payload: unknown) => void>>([
    ["workspace_update", new Set()],
    ["kernel_status", new Set()],
    ["execute_stream", new Set()],
  ]);
  const manifestCache = new Map<string, SimulationManifestDoc>();

  let lastExecuteId: string | null = null;
  let isSocketReady = (socket as unknown as { readyState?: number }).readyState === 1;
  let handshakeDone = false;
  let readyReject: ((reason?: unknown) => void) | null = null;
  // Hoisted out of the Promise executor (same reason readyReject is) so the
  // kernel_status handshake-ack handler in socket.onmessage below — the
  // *normal*, fast path, not the 200ms fallback — can actually resolve
  // readyPromise instead of only setting the handshakeDone flag next to an
  // already-settled "resolve". Real bug this fixes: the server sends
  // kernel_status {state:"idle"} as its handshake reply immediately
  // (handshake.py), essentially always arriving well under 200ms on a local
  // loopback connection. The onmessage handler used to set handshakeDone =
  // true directly without calling resolve() — so by the time the 200ms
  // setTimeout below checked `!handshakeDone`, it was already true and its
  // own resolve() call was skipped too. Net effect: readyPromise never
  // resolved through any path on the fast/common case, only on the rare
  // case where the 200ms timer fires first — so every execute() call
  // (`await readyPromise`) hung indefinitely before ever reaching
  // socket.send(), for the rest of that connection's lifetime. Reported
  // live: the WebSocket "Messages" panel showed only periodic `ping`
  // frames, never a `simulate` frame, confirming execute() never got past
  // this await.
  let readyResolve: (() => void) | null = null;

  const readyPromise = new Promise<void>((resolve, reject) => {
    readyReject = reject;
    readyResolve = resolve;

    const done = () => {
      if (!handshakeDone) {
        handshakeDone = true;
        resolve();
      }
    };

    const sendHandshake = () => {
      try {
        const { token } = getKernelConfig();
        socket.send(JSON.stringify({ id: "handshake", type: "handshake", payload: { token } }));
      } catch {
        // In tests with minimal fake sockets, fall back to ready without handshake.
        done();
      }
    };

    // Fake sockets used in tests may not have onopen; treat as ready.
    if (!("onopen" in socket)) {
      isSocketReady = true;
      done();
      return;
    }

    socket.onopen = () => {
      isSocketReady = true;
      sendHandshake();
    };

    // If no token is configured and server does not require it (or we are on test fakes),
    // allow progress even without explicit kernel_status handshake ack.
    setTimeout(() => {
      if (isSocketReady && !handshakeDone) done();
    }, 200);
  });

  const emit = (event: EventName, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) {
      listener(payload);
    }
  };

  // Without these, a WebSocket that never opens (or drops mid-session) left
  // every execute() call awaiting readyPromise — or a pending request — that
  // would never resolve or reject, hanging the UI forever after "Sending to
  // backend…" with no error ever surfacing (reported live: netlist sent,
  // "Starting simulation…" shown, then nothing — no completion, no error).
  if ("onerror" in socket) {
    socket.onerror = () => {
      if (readyReject && !handshakeDone) {
        handshakeDone = true;
        readyReject(new Error("Could not connect to the kernel sidecar."));
      }
    };
  }
  if ("onclose" in socket) {
    socket.onclose = (event) => {
      const reason = `Kernel sidecar connection closed${
        event && "code" in event ? ` (code ${(event as CloseEvent).code})` : ""
      }.`;
      if (readyReject && !handshakeDone) {
        handshakeDone = true;
        readyReject(new Error(reason));
      }
      // Reject any requests already in flight so a mid-session drop can't
      // leave them hanging — each surfaces as a normal "Solver error: …" via
      // triggerRun's catch block instead of a silent, permanent stall.
      for (const p of pending.values()) {
        p.reject(new Error(reason));
      }
      pending.clear();
      emit("kernel_status", "disconnected");
    };
  }

  socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const chunk = decodeWaveformChunkFrame(event.data);
      if (chunk) {
        const cacheKey = `${chunk.simId}::${chunk.signalId}`;
        // Deferred imports break circular dependencies:
        // waveform store → ipc/transport → ipc/client → store/waveform (import())
        // ipc store has no such cycle but is kept deferred too for symmetry.
        void import("../store/waveform").then(({ useWaveformStore }) => {
          useWaveformStore.getState().appendChunk(cacheKey, chunk.values, chunk.x);
        });
        // FE-154: the first chunk for a signal is the SignalBrowser
        // sidebar's only signal (TRAN analyses stream live chunks well
        // before the final simulate_result/manifest arrives) — register it
        // immediately so the signal list fills in live during the run
        // instead of staying empty until the whole simulation finishes.
        void import("../store/ipc").then(({ useIpcStore }) => {
          useIpcStore.getState().registerLiveSignal(chunk.simId, chunk.signalId);
        });
      }
      return;
    }
    const message = JSON.parse(event.data as string) as Envelope;

    if (message.type === "kernel_status") {
      const payloadStatus =
        typeof message.payload === "object" &&
        message.payload !== null &&
        "state" in message.payload
          ? (message.payload as { state?: unknown }).state
          : message.payload;
      const status = message.status ?? payloadStatus;
      emit("kernel_status", status);
      if (!handshakeDone) {
        handshakeDone = true;
        readyResolve?.();
      }
      return;
    }

    if (message.type === "workspace_update") {
      emit("workspace_update", message.payload);
      return;
    }

    if (message.type === "execute_stream") {
      const chunk =
        message.chunk ?? (message.payload as { chunk?: string } | undefined)?.chunk ?? "";
      const pendingExecute = pending.get(message.id);
      if (pendingExecute && chunk) pendingExecute.chunks.push(chunk);
      emit("execute_stream", { id: message.id, chunk });
      return;
    }

    if (message.type === "execute_result") {
      const p = pending.get(message.id);
      if (!p) return;
      pending.delete(message.id);
      p.resolve({
        ...(message.result ?? {}),
        manifest: (message.result?.manifest as ExecuteResult["manifest"]) ?? {
          sim_id: "",
          signals: [],
          t_start: 0,
          t_end: 0,
        },
        chunks: [...p.chunks],
      });
      emit("kernel_status", "idle");
      return;
    }

    // waveform_chunk arrives as a binary frame (BE-56), handled in the
    // ArrayBuffer branch above — the backend no longer sends it as JSON.

    if (message.type === "waveform_done") {
      const payload = (message.payload ?? {}) as {
        signal_id?: string;
      };
      const signalId = payload.signal_id ?? "";
      if (signalId) {
        void import("../store/waveform").then(({ useWaveformStore }) => {
          useWaveformStore.getState().markStreamingDone(signalId);
        });
      }
      return;
    }

    if (message.type === "simulate_progress") {
      const payload = (message.payload ?? {}) as { frac?: number; message?: string };
      // Synchronous — must apply in-order with simulate_result. A dynamic
      // import() here (as this used to do) defers via a microtask, and if
      // simulate_result for the same run lands first, the deferred progress
      // update was observed to apply *after* triggerRun's own
      // setSimProgress(null), leaving the toolbar stuck showing "Solving…"
      // indefinitely after the run had actually finished.
      useIpcStore.getState().setSimProgress(payload.frac ?? null, payload.message);
      return;
    }

    if (message.type === "simulate_result") {
      const p = pending.get(message.id);
      if (!p) return;
      pending.delete(message.id);

      const payload = (message.payload ?? {}) as {
        status?: string;
        message?: string;
        sim_id?: string;
        t_start?: number;
        t_end?: number;
        signals?: Array<{
          name?: string;
          url?: string;
          analysis?: string;
          quantity?: string;
          unit?: string;
          domain?: string;
        }>;
        dc_op_table?: Array<{
          node_or_branch?: string;
          quantity?: string;
          value?: number;
          unit?: string;
        }>;
      };

      if (payload.status === "error") {
        p.resolve({
          status: "error",
          manifest: { sim_id: "", signals: [], t_start: 0, t_end: 0 },
          chunks: [payload.message ?? "Simulation error"],
        });
        emit("kernel_status", "idle");
        return;
      }

      const simId = payload.sim_id ?? "";
      const signals = (payload.signals ?? []).map((s) => s.name ?? "").filter(Boolean);
      // Pre-warm manifestCache from the WS payload so waveformGet() never
      // needs an extra HTTP round-trip for a manifest it already has. This
      // must carry the same BE-47 metadata fields (analysis/quantity/unit/
      // domain) that a fetched manifest.json would — omitting them here
      // silently discarded them for every run, since waveformGet() only
      // fetches manifest.json when the cache is empty.
      manifestCache.set(simId, {
        sim_id: simId,
        t_start: Number(payload.t_start ?? 0),
        t_end: Number(payload.t_end ?? 0),
        n_points: 0,
        signals: (payload.signals ?? [])
          .map((s) => ({
            name: s.name ?? "",
            url: s.url ?? "",
            analysis: s.analysis,
            quantity: s.quantity,
            unit: s.unit,
            domain: s.domain,
          }))
          .filter((s) => s.name && s.url),
      });

      const dcOpTable = (payload.dc_op_table ?? [])
        .filter((entry) => entry.node_or_branch !== undefined)
        .map((entry) => ({
          node_or_branch: entry.node_or_branch ?? "",
          quantity: entry.quantity ?? "",
          value: Number(entry.value ?? 0),
          unit: entry.unit ?? "",
        }));

      p.resolve({
        status: "ok",
        manifest: {
          sim_id: simId,
          signals,
          t_start: Number(payload.t_start ?? 0),
          t_end: Number(payload.t_end ?? 0),
        },
        dc_op_table: dcOpTable.length > 0 ? dcOpTable : undefined,
      });
      emit("kernel_status", "idle");
    }
  };

  const send = (envelope: Envelope) => {
    socket.send(JSON.stringify(envelope));
  };

  return {
    async execute(payload: unknown): Promise<ExecuteResult> {
      await readyPromise;

      const id = createRequestId();
      lastExecuteId = id;
      emit("kernel_status", "busy");

      let outboundType: OutboundType = "execute";
      let outboundPayload: unknown = payload;

      if (typeof payload === "object" && payload !== null) {
        const maybe = payload as { type?: string; [k: string]: unknown };
        if (maybe.type === "simulate") {
          outboundType = "simulate";
          const { type: _drop, ...rest } = maybe;
          outboundPayload = rest;
        } else if (maybe.type === "execute") {
          outboundType = "execute";
          const { type: _drop, ...rest } = maybe;
          outboundPayload = rest;
        }
      } else if (typeof payload === "string") {
        outboundPayload = { code: payload };
      }

      return new Promise((resolve, reject) => {
        pending.set(id, { id, type: outboundType, resolve, reject, chunks: [] });
        send({ id, type: outboundType, payload: outboundPayload });
      });
    },
    cancel(id?: string): void {
      const requestId = id ?? lastExecuteId;
      if (!requestId) return;
      const p = pending.get(requestId);
      if (!p) return;
      pending.delete(requestId);
      // socket.send() throws synchronously if the connection has already
      // closed (e.g. the sidecar crashed mid-run) — without this try/catch,
      // that throw would skip the reject()/emit("idle") below, leaving the
      // Run button stuck on "Stop" with no way to click free of it, since
      // clicking it again just throws the same way.
      try {
        send({
          id: requestId,
          type: p.type === "simulate" ? "simulate_cancel" : "execute_cancel",
          payload: { target_id: requestId },
        });
      } catch {
        // The connection is already gone — nothing to tell the backend.
      }
      p.reject(new CancelledError());
      emit("kernel_status", "idle");
    },
    async workspaceGet(): Promise<null> {
      return null;
    },
    async waveformGet(simId: string, signals: string[]): Promise<WaveformSlice> {
      const { port, token } = getKernelConfig();

      let manifest = manifestCache.get(simId);
      if (!manifest) {
        const res = await fetch(
          `http://127.0.0.1:${port}/results/${simId}/manifest.json?token=${token}`,
        );
        if (!res.ok) throw new Error(`Failed to fetch manifest for ${simId}`);
        manifest = (await res.json()) as SimulationManifestDoc;
        manifestCache.set(simId, manifest);
      }

      const traces: WaveformSlice["traces"] = [];
      for (const label of signals) {
        const entry = manifest.signals.find((s) => s.name === label);
        if (!entry) continue;
        const normalized = entry.url.startsWith("/") ? entry.url.slice(1) : entry.url;
        const sigRes = await fetch(`http://127.0.0.1:${port}/${normalized}?token=${token}`);
        if (!sigRes.ok) throw new Error(`Failed to fetch signal ${label}`);
        const arr = parseNpyFloatArray(await sigRes.arrayBuffer());
        traces.push({
          label,
          values: Array.from(arr),
          analysis: entry.analysis,
          quantity: entry.quantity,
          unit: entry.unit,
          domain: entry.domain,
        });
      }

      const n = traces[0]?.values.length ?? manifest.n_points ?? 0;
      const t0 = Number(manifest.t_start ?? 0);
      const t1 = Number(manifest.t_end ?? 0);
      const time =
        n <= 1 ? [t0] : Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / (n - 1));

      return { time, traces };
    },
    subscribe(event, listener) {
      const typedEvent = event as EventName;
      listeners.get(typedEvent)?.add(listener);
      return () => {
        listeners.get(typedEvent)?.delete(listener);
      };
    },
  };
}

export default createIPCClient;
