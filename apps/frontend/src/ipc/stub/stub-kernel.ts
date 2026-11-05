import {
  CancelledError,
  type ExecuteResult,
  type IpcClient,
  type WaveformSlice,
  type WorkspaceVariable,
} from "../types";
import {
  STUB_EXECUTE_CHUNKS,
  STUB_MANIFEST,
  STUB_WAVEFORM,
  STUB_WORKSPACE_VARIABLES,
} from "./fixtures";

type StubEvent = "workspace_update" | "kernel_status" | "execute_stream";
type Listener = (payload: unknown) => void;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createStubKernel(): IpcClient & {
  on(event: StubEvent, listener: Listener): () => void;
} {
  const listeners = new Map<StubEvent, Set<Listener>>([
    ["workspace_update", new Set()],
    ["kernel_status", new Set()],
    ["execute_stream", new Set()],
  ]);
  let lastExecuteId: string | null = null;

  const emit = (event: StubEvent, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) {
      listener(payload);
    }
  };

  return {
    async execute(payload: unknown): Promise<ExecuteResult> {
      lastExecuteId = `stub-${Date.now()}`;
      emit("kernel_status", "busy");
      return new Promise((resolve) => {
        window.setTimeout(() => {
          emit("workspace_update", clone(STUB_WORKSPACE_VARIABLES));
          emit("kernel_status", "idle");
          const type =
            typeof payload === "object" && payload !== null
              ? (payload as { type?: string }).type
              : undefined;
          if (type === "execute") {
            for (const chunk of STUB_EXECUTE_CHUNKS) {
              emit("execute_stream", { id: lastExecuteId, chunk });
            }
          }
          resolve({
            manifest: clone(STUB_MANIFEST),
            chunks: type === "execute" ? [...STUB_EXECUTE_CHUNKS] : undefined,
          });
        }, 20);
      });
    },
    cancel(): void {
      throw new CancelledError();
    },
    async workspaceGet(name: string): Promise<WorkspaceVariable | null> {
      return clone(STUB_WORKSPACE_VARIABLES.find((entry) => entry.name === name) ?? null);
    },
    async waveformGet(_simId: string, signals: string[]): Promise<WaveformSlice> {
      return clone({
        time: STUB_WAVEFORM.time,
        traces: STUB_WAVEFORM.traces.filter((trace) => signals.includes(trace.label)),
      });
    },
    subscribe(event, listener) {
      const typedEvent = event as StubEvent;
      listeners.get(typedEvent)?.add(listener);
      if (typedEvent === "workspace_update") {
        listener(clone(STUB_WORKSPACE_VARIABLES));
      }
      if (typedEvent === "kernel_status") {
        listener("idle");
      }
      return () => {
        listeners.get(typedEvent)?.delete(listener);
      };
    },
    on(event, listener) {
      listeners.get(event)?.add(listener);
      return () => {
        listeners.get(event)?.delete(listener);
      };
    },
  };
}

export default createStubKernel;
