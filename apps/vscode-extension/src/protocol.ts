/**
 * Message protocol between the General Simulator webviews and this extension
 * host.
 *
 * The message shapes are declared once, in `@gensim/webview-protocol`, and
 * re-exported here as **types only**. That matters: this extension is packaged
 * with `vsce package --no-dependencies`, so nothing from `node_modules` ships
 * in the `.vsix`. A value import would compile to a `require` that resolves on
 * this machine and throws `Cannot find module` the moment the extension is
 * installed anywhere else — a failure no build, test or typecheck here would
 * have caught. A `type` import is erased, so nothing is required at runtime.
 *
 * The two runtime values below are therefore defined locally rather than
 * imported. They are the stable part — a constant and a shape check — while
 * the message union is the part that actually changes and is now declared in
 * exactly one place. `protocol.test.ts` asserts these copies still agree with
 * the package.
 */

export type {
  HostBoundMessage,
  KernelConfig,
  WebviewBoundMessage,
  WebviewInit,
  WebviewRole,
} from "@gensim/webview-protocol";

import type { HostBoundMessage } from "@gensim/webview-protocol";

/** Injected into every webview as `window.__GSIM_INIT__` before the bundle runs. */
export const GSIM_INIT_GLOBAL = "__GSIM_INIT__";

/**
 * Narrow an untrusted `message` from a webview to the protocol.
 *
 * Shape only — it asserts the envelope is an object carrying a `gsim/`-prefixed
 * `type`, not that the payload matches that type's own shape.
 */
export function isHostBoundMessage(value: unknown): value is HostBoundMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    (value as { type: string }).type.startsWith("gsim/")
  );
}
