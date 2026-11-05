/**
 * The VS Code kernel bridge — the replacement for the frontend's only
 * Tauri-specific integration point (`invoke("restart_kernel")` in
 * `reconnectKernel()`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initKernelFromVsCode, reconnectKernel, setIpcClient } from "./transport";
import { applyKernelConfig, isVsCodeHost, setVsCodeApi } from "./vscode-host";

const posted: unknown[] = [];

/**
 * jsdom's WebSocket would actually try to dial 127.0.0.1 and then reject the
 * client's ready promise asynchronously, with nobody awaiting it. The bridge
 * under test only cares that a client gets constructed against the config the
 * host supplied, so stand in an inert socket.
 */
class InertSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  send(): void {}
  close(): void {}
}

let RealWebSocket: typeof WebSocket | undefined;

function hostSays(message: unknown): void {
  globalThis.dispatchEvent(new MessageEvent("message", { data: message }));
}

function installFakeHost(): void {
  setVsCodeApi({
    postMessage: (message: unknown) => {
      posted.push(message);
    },
    getState: () => null,
    setState: (state: unknown) => state,
  });
}

function clearKernelGlobals(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.__KERNEL_PORT__ = undefined;
  globals.__KERNEL_TOKEN__ = undefined;
  globals.__GSIM_INIT__ = undefined;
}

beforeEach(() => {
  posted.length = 0;
  clearKernelGlobals();
  RealWebSocket = globalThis.WebSocket;
  (globalThis as { WebSocket: unknown }).WebSocket = InertSocket;
});

afterEach(() => {
  if (RealWebSocket) {
    (globalThis as { WebSocket: unknown }).WebSocket = RealWebSocket;
  }
  setVsCodeApi(null);
  clearKernelGlobals();
  setIpcClient(null as never);
});

describe("isVsCodeHost", () => {
  it("is false when the webview API is absent", () => {
    setVsCodeApi(null);
    expect(isVsCodeHost()).toBe(false);
  });

  it("is true once the webview API is available", () => {
    installFakeHost();
    expect(isVsCodeHost()).toBe(true);
  });
});

describe("applyKernelConfig", () => {
  it("publishes port and token onto the globals ipc/client reads", () => {
    applyKernelConfig({ port: 51234, token: "abc" });
    const globals = globalThis as Record<string, unknown>;
    expect(globals.__KERNEL_PORT__).toBe(51234);
    expect(globals.__KERNEL_TOKEN__).toBe("abc");
  });
});

describe("initKernelFromVsCode", () => {
  it("is inert outside a VS Code webview", () => {
    setVsCodeApi(null);
    expect(() => initKernelFromVsCode()).not.toThrow();
    expect(posted).toEqual([]);
  });

  it("adopts a kernel config pushed by the extension host after activation", async () => {
    installFakeHost();
    initKernelFromVsCode();

    hostSays({ type: "gsim/kernelConfig", kernel: { port: 4242, token: "tok" } });
    await Promise.resolve();

    const globals = globalThis as Record<string, unknown>;
    expect(globals.__KERNEL_PORT__).toBe(4242);
    expect(globals.__KERNEL_TOKEN__).toBe("tok");
  });

  it("adopts a config injected into __GSIM_INIT__ before the bundle ran", () => {
    (globalThis as Record<string, unknown>).__GSIM_INIT__ = {
      role: "schematic",
      kernel: { port: 777, token: "early" },
    };
    installFakeHost();
    initKernelFromVsCode();

    const globals = globalThis as Record<string, unknown>;
    expect(globals.__KERNEL_PORT__).toBe(777);
    expect(globals.__KERNEL_TOKEN__).toBe("early");
  });
});

describe("reconnectKernel", () => {
  it("asks the extension host to restart the sidecar and waits for the new port", async () => {
    installFakeHost();

    const pending = reconnectKernel();
    expect(posted).toEqual([{ type: "gsim/restartKernel" }]);

    // Still pending until the host reports a ready sidecar.
    hostSays({ type: "gsim/kernelConfig", kernel: { port: 5150, token: "fresh" } });
    await pending;

    const globals = globalThis as Record<string, unknown>;
    expect(globals.__KERNEL_PORT__).toBe(5150);
    expect(globals.__KERNEL_TOKEN__).toBe("fresh");
  });

  it("rejects if the sidecar stops before becoming ready", async () => {
    installFakeHost();

    const pending = reconnectKernel();
    hostSays({ type: "gsim/kernelStopped" });

    await expect(pending).rejects.toThrow(/stopped before it became ready/i);
  });
});
