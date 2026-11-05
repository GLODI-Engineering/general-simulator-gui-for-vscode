/**
 * The object `activate()` returns, reachable from an integration test as
 * `vscode.extensions.getExtension(EXTENSION_ID).exports`.
 *
 * It is a thin, read-mostly façade over the *live* `GsimHost` — it does not
 * fake or shortcut anything. `probe()` in particular routes through the real
 * `Webview.postMessage` channel and waits for the real `gsim/test/report`
 * reply to come back through `GsimHost.handleCommonMessage`, so a passing
 * assertion proves the whole chain works end to end.
 */
import * as vscode from "vscode";

import type { GsimHost } from "./host";
import type { KernelConfig, WebviewRole } from "./protocol";

/**
 * `publisher.name` from package.json. Kept in one place: when the manifest
 * was renamed, three separate copies of this literal silently stopped
 * matching and the whole integration suite failed in its `before all` hook.
 */
export const EXTENSION_ID = "gensim.general-simulator-gui";

export interface GsimTestApi {
  /** Roles whose React app has reported `gsim/ready`. */
  readonly readyRoles: () => WebviewRole[];
  /** Resolve once the given role's webview has mounted. */
  waitForWebview(role: WebviewRole, timeoutMs?: number): Promise<void>;
  /** Run a probe inside a live webview and return its result. */
  probe<T = unknown>(
    role: WebviewRole,
    op: string,
    args?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T>;
  /** Await the next message of `type` arriving from `role`. */
  nextMessage<T = unknown>(role: WebviewRole, type: string, timeoutMs?: number): Promise<T>;
  /** The live kernel sidecar config, if it has started. */
  kernelConfig(): KernelConfig | null;
  startKernel(): Promise<KernelConfig | null>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function timeout(ms: number, what: string): Promise<never> {
  return new Promise((_resolve, reject) =>
    setTimeout(() => reject(new Error(`timed out after ${ms}ms waiting for ${what}`)), ms),
  );
}

export function createTestApi(host: GsimHost): GsimTestApi {
  let sequence = 0;

  return {
    readyRoles: () => [...host.readyRoles],

    async waitForWebview(role, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
      if (host.readyRoles.has(role)) {
        return;
      }
      await Promise.race([
        new Promise<void>((resolve) => {
          const subscription = host.onDidWebviewReady((readyRole) => {
            if (readyRole === role) {
              subscription.dispose();
              resolve();
            }
          });
        }),
        timeout(timeoutMs, `${role} webview to report gsim/ready`),
      ]);
    },

    async probe<T>(
      role: WebviewRole,
      op: string,
      args: Record<string, unknown> = {},
      timeoutMs = DEFAULT_TIMEOUT_MS,
    ): Promise<T> {
      const webview = host.webviewFor(role);
      if (!webview) {
        throw new Error(`no live ${role} webview registered`);
      }
      sequence += 1;
      const requestId = `probe-${sequence}`;

      const reply = Promise.race([
        new Promise<T>((resolve, reject) => {
          const subscription = host.onDidReceive(({ role: from, message }) => {
            if (
              from === role &&
              message.type === "gsim/test/report" &&
              message.requestId === requestId
            ) {
              subscription.dispose();
              if (message.ok) {
                resolve(message.result as T);
              } else {
                reject(new Error(`probe "${op}" failed in ${role}: ${String(message.result)}`));
              }
            }
          });
        }),
        timeout(timeoutMs, `probe "${op}" reply from ${role}`),
      ]);

      await webview.postMessage({ type: "gsim/test/exec", requestId, op, args });
      return reply;
    },

    async nextMessage<T>(
      role: WebviewRole,
      type: string,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    ): Promise<T> {
      return Promise.race([
        new Promise<T>((resolve) => {
          const subscription = host.onDidReceive(({ role: from, message }) => {
            if (from === role && message.type === type) {
              subscription.dispose();
              resolve(message as T);
            }
          });
        }),
        timeout(timeoutMs, `a "${type}" message from ${role}`),
      ]);
    },

    kernelConfig: () => host.kernel.current,
    startKernel: () => host.kernel.start(),
  };
}

/** Convenience for tests: fetch the API the extension exported. */
export async function getTestApi(): Promise<GsimTestApi> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) {
    throw new Error(`${EXTENSION_ID} is not installed in this VS Code instance`);
  }
  // Not named `exports`: this file compiles to CommonJS, where a module-level
  // `export const` is emitted as `exports.NAME`. A local binding called
  // `exports` shadows that, and every reference to EXTENSION_ID above then
  // hits the temporal dead zone of this very declaration —
  // "Cannot access 'exports' before initialization", thrown from a line that
  // mentions neither.
  const api = (await extension.activate()) as GsimTestApi | undefined;
  if (!api?.waitForWebview) {
    throw new Error("extension did not export its test API (is GSIM_INTEGRATION_TEST set?)");
  }
  return api;
}
