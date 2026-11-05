/**
 * Thin wrapper around the VS Code webview <-> extension-host message channel.
 *
 * Every General Simulator webview (the schematic custom editor, the library
 * sidebar view, the waveform panel) talks to the extension host through this
 * module. Outside VS Code — the Vite dev server, vitest, the Tauri shell — all
 * of these are inert no-ops, so component code can call them unconditionally.
 */

import {
  GSIM_INIT_GLOBAL,
  type HostBoundMessage,
  type WebviewBoundMessage,
  type WebviewInit,
} from "./vscode-protocol";

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): unknown;
}

type HostGlobals = typeof globalThis & {
  acquireVsCodeApi?: () => VsCodeApi;
  /** Handle acquired by the extension host's injected bootstrap script. */
  __GSIM_VSCODE_API__?: VsCodeApi;
  [GSIM_INIT_GLOBAL]?: WebviewInit;
};

// `acquireVsCodeApi()` may only be called once per webview document.
let cachedApi: VsCodeApi | null | undefined;

export function getVsCodeApi(): VsCodeApi | null {
  if (cachedApi !== undefined) {
    return cachedApi;
  }
  const globals = globalThis as HostGlobals;
  // The injected bootstrap already acquired it (calling twice throws), so
  // prefer its handle and only fall back for safety.
  if (globals.__GSIM_VSCODE_API__) {
    cachedApi = globals.__GSIM_VSCODE_API__;
    return cachedApi;
  }
  cachedApi = typeof globals.acquireVsCodeApi === "function" ? globals.acquireVsCodeApi() : null;
  return cachedApi;
}

/** Test seam: lets vitest install a fake host API. */
export function setVsCodeApi(api: VsCodeApi | null): void {
  cachedApi = api;
}

export function isVsCodeHost(): boolean {
  return getVsCodeApi() !== null;
}

export function getWebviewInit(): WebviewInit | null {
  return (globalThis as HostGlobals)[GSIM_INIT_GLOBAL] ?? null;
}

export function postToHost(message: HostBoundMessage): void {
  getVsCodeApi()?.postMessage(message);
}

/**
 * Subscribe to messages sent by the extension host. Returns an unsubscribe fn.
 */
export function onHostMessage(handler: (message: WebviewBoundMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    const data = event.data as WebviewBoundMessage | undefined;
    if (data && typeof data === "object" && typeof data.type === "string") {
      if (data.type.startsWith("gsim/")) {
        handler(data);
      }
    }
  };
  globalThis.addEventListener("message", listener as EventListener);
  return () => {
    globalThis.removeEventListener("message", listener as EventListener);
  };
}

/**
 * Publish the kernel sidecar's port + token onto the globals that
 * `ipc/client.ts` reads. Mirrors what the Tauri bootstrap does with
 * `get_kernel_config`.
 */
export function applyKernelConfig(kernel: { port: number; token: string }): void {
  const globals = globalThis as Record<string, unknown>;
  globals.__KERNEL_PORT__ = kernel.port;
  globals.__KERNEL_TOKEN__ = kernel.token;
}
