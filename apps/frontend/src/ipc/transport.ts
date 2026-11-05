import { createIPCClient } from "./client";
import { createStubKernel } from "./stub/stub-kernel";
import type { IpcClient } from "./types";
import {
  applyKernelConfig,
  getWebviewInit,
  isVsCodeHost,
  onHostMessage,
  postToHost,
} from "./vscode-host";

type EventName = "workspace_update" | "kernel_status" | "execute_stream";

/** The concrete client actually doing the work — stub, or a real WS client. */
let realClient: IpcClient | null = null;

/** Non-null while a connect/reconnect attempt (initial or triggered by
 * reconnectKernel()) is in flight; null once it settles. */
let connectPromise: Promise<IpcClient> | null = null;

interface SubscriptionEntry {
  event: EventName;
  listener: (payload: unknown) => void;
  unsubscribeReal: (() => void) | null;
}
const subscriptions = new Set<SubscriptionEntry>();

/** Swap in a new concrete client and re-home every active subscription onto
 * it, so callers holding the stable proxy never notice the swap. */
function setRealClient(next: IpcClient): void {
  realClient = next;
  for (const entry of subscriptions) {
    entry.unsubscribeReal?.();
    entry.unsubscribeReal = next.subscribe(entry.event, entry.listener);
  }
}

/**
 * Stable proxy returned by every getIpcClient() call for the app's whole
 * lifetime — callers (App.tsx's kernel_status subscription, triggerRun(),
 * etc.) never hold a reference to the concrete stub/real client directly.
 * Delegates to whichever concrete client is current, transparently waiting
 * for a connect attempt in flight, and re-homing subscriptions whenever the
 * concrete client is swapped out from under it (the extension host's initial
 * kernelConfig, or a reconnectKernel() call after a drop) — without this, a
 * subscription registered before a reconnect would go permanently stale,
 * silently stopping status updates for the rest of the session.
 */
const proxyClient: IpcClient = {
  execute: (payload) => {
    if (realClient) return realClient.execute(payload);
    if (connectPromise) return connectPromise.then((c) => c.execute(payload));
    return Promise.reject(new Error("No kernel connection available."));
  },
  cancel: (id) => {
    realClient?.cancel(id);
  },
  workspaceGet: (name) => {
    if (realClient) return realClient.workspaceGet(name);
    if (connectPromise) return connectPromise.then((c) => c.workspaceGet(name));
    return Promise.resolve(null);
  },
  waveformGet: (simId, signals) => {
    if (realClient) return realClient.waveformGet(simId, signals);
    if (connectPromise) return connectPromise.then((c) => c.waveformGet(simId, signals));
    return Promise.reject(new Error("No kernel connection available."));
  },
  subscribe: (event, listener) => {
    const entry: SubscriptionEntry = {
      event,
      listener,
      unsubscribeReal: realClient ? realClient.subscribe(event, listener) : null,
    };
    subscriptions.add(entry);
    return () => {
      entry.unsubscribeReal?.();
      subscriptions.delete(entry);
    };
  },
};

export function getIpcClient(): IpcClient {
  if (!realClient && !connectPromise && !isVsCodeHost()) {
    // Dev harness / vitest: pick the stub kernel, or a directly-configured
    // real WS backend when one is pointed at explicitly.
    const globals = globalThis as typeof globalThis & { __KERNEL_PORT__?: string | number };
    const preferWs =
      import.meta.env.VITE_IPC_TRANSPORT === "ws" || typeof globals.__KERNEL_PORT__ !== "undefined";
    setRealClient(preferWs ? createIPCClient() : createStubKernel());
  }
  return proxyClient;
}

export function setIpcClient(nextClient: IpcClient): void {
  connectPromise = null;
  setRealClient(nextClient);
}

/**
 * Bootstrap for the VS Code extension host.
 *
 * The extension host owns the kernel-sidecar child process. It injects the sidecar's port + token as
 * `window.__GSIM_INIT__.kernel` when the sidecar is already up, and pushes a
 * `gsim/kernelConfig` message whenever it (re)starts on a new port. Both land
 * on the same globals `ipc/client.ts` reads, so the WebSocket transport is
 * untouched.
 *
 * This does NOT block app mount: while the sidecar is still starting, `connectPromise` keeps the proxy client queueing work
 * until the host reports ready, rather than silently serving stub data.
 */
export function initKernelFromVsCode(): void {
  if (!isVsCodeHost()) return;

  const init = getWebviewInit();
  if (init?.kernel) {
    applyKernelConfig(init.kernel);
    setRealClient(createIPCClient());
  } else if (!connectPromise) {
    connectPromise = awaitKernelFromHost();
    connectPromise.catch(() => {});
  }

  // Later (re)starts: the host pushes a fresh config on a new port.
  onHostMessage((message) => {
    if (message.type === "gsim/kernelConfig") {
      applyKernelConfig(message.kernel);
      connectPromise = null;
      setRealClient(createIPCClient());
    }
  });
}

/** Resolve once the extension host reports a ready kernel sidecar. */
function awaitKernelFromHost(): Promise<IpcClient> {
  return new Promise<IpcClient>((resolve, reject) => {
    const dispose = onHostMessage((message) => {
      if (message.type === "gsim/kernelConfig") {
        dispose();
        applyKernelConfig(message.kernel);
        const client = createIPCClient();
        setRealClient(client);
        connectPromise = null;
        resolve(client);
      } else if (message.type === "gsim/kernelStopped") {
        dispose();
        connectPromise = null;
        reject(new Error("Kernel sidecar stopped before it became ready."));
      }
    });
  });
}

/**
 * Explicitly (re)connect to the kernel sidecar. Used by triggerRun() when
 * Run is clicked while the kernel is disconnected/errored: shows the user
 * what's happening and actually attempts to bring the backend back up,
 * instead of just failing the click again with the same stale error.
 */
export async function reconnectKernel(): Promise<void> {
  if (connectPromise) {
    await connectPromise;
    return;
  }

  if (isVsCodeHost()) {
    // The extension host owns the child process — ask it to restart, then
    // wait for the fresh gsim/kernelConfig. The host is the only thing that
    // can restart the sidecar; the webview cannot spawn a process.
    connectPromise = awaitKernelFromHost();
    postToHost({ type: "gsim/restartKernel" });
    await connectPromise;
    return;
  }

  // A directly-configured WS client (VITE_IPC_TRANSPORT=ws) that dropped —
  // open a fresh connection. Plain stub-kernel usage never reports
  // "disconnected" in the first place (the stub always reports "idle" on
  // subscribe), so this branch is WS-only.
  connectPromise = (async () => {
    const next = createIPCClient();
    setRealClient(next);
    return next;
  })();
  try {
    await connectPromise;
  } finally {
    connectPromise = null;
  }
}
