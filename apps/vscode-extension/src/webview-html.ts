/**
 * Turns a Vite-built HTML entry into webview-ready HTML.
 *
 * The frontend is built by Vite with `base: "./"`, so its HTML references
 * assets as `./assets/<name>.js`. Those relative URLs mean nothing on a
 * `vscode-webview://` origin, so every `src`/`href` is rewritten through
 * `Webview.asWebviewUri`, a CSP is injected, and the per-webview bootstrap
 * (`window.__GSIM_INIT__`) is prepended.
 *
 * `rewriteWebviewHtml` is pure so it can be unit tested without VS Code.
 */
import { GSIM_INIT_GLOBAL, type WebviewInit } from "./protocol";

const ASSET_REF = /(\s(?:src|href)=")(\.?\/?assets\/[^"]+)(")/g;

/**
 * Why `script-src` carries no `'unsafe-eval'`, and what it costs to keep it
 * that way.
 *
 * It did, for one release: the webview bundle had two independent sources of
 * runtime code generation, and without the directive every webview died at
 * module-evaluation time with `EvalError: Evaluating a string as JavaScript
 * violates ... 'unsafe-eval'` and rendered nothing at all. The failure is
 * silent from the outside — a blank panel, no error in the extension host —
 * which is why the integration suite, not inspection, is what catches it.
 *
 * Both sources are gone:
 *
 * 1. **Ajv** (`apps/frontend/src/file/schema.ts`,
 *    `apps/frontend/src/library/catalog-core.ts`) called `ajv.compile()` at
 *    module top level, which built validators with `new Function` on import,
 *    before React ever mounted. The schemas are now compiled ahead of time by
 *    `apps/frontend/scripts/gen-validators.mjs` into ordinary ES modules.
 * 2. **Parametric expressions** (`store/model.ts`,
 *    `inspector/ParamExpressionInput.tsx`) evaluated user expressions with
 *    `new Function`. They now use the lexer/parser in
 *    `apps/frontend/src/persistence/param_expression.ts`, which implements the
 *    grammar the format spec actually defines (§5.2) and generates no code.
 *
 * So: **nothing in the webview bundle may generate code at runtime.** Adding a
 * dependency that does — a JSON-schema compiler, a templating engine, a
 * charting library that compiles accessors — will blank the webview rather
 * than degrade, and the fix is to precompile or replace it, never to loosen
 * this directive. `apps/frontend` is checked for `new Function`/`eval(` after
 * every build for exactly this reason.
 */

export interface RewriteOptions {
  /** Maps a dist-relative asset path (e.g. `assets/foo.js`) to a webview URI. */
  toWebviewUri: (assetPath: string) => string;
  /** `Webview.cspSource`, e.g. `vscode-webview-resource:`. */
  cspSource: string;
  nonce: string;
  init: WebviewInit;
  /** Origins the webview may open sockets / fetch to (the kernel sidecar). */
  connectSources: readonly string[];
}

export function makeNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

export function rewriteWebviewHtml(html: string, options: RewriteOptions): string {
  const { toWebviewUri, cspSource, nonce, init, connectSources } = options;

  let out = html.replace(ASSET_REF, (_match, prefix: string, ref: string, suffix: string) => {
    const normalized = ref.replace(/^\.?\//, "");
    return `${prefix}${toWebviewUri(normalized)}${suffix}`;
  });

  // Vite emits `crossorigin` on every module script and modulepreload. On a
  // `vscode-webview://` origin that forces a CORS fetch the resource loader
  // does not answer, so the bundle silently fails to load. Strip it.
  out = out.replace(/\scrossorigin(?:="[^"]*")?/g, "");

  // Every <script> the bundle ships must carry the nonce to satisfy the CSP.
  out = out.replace(/<script\b(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`);

  const connect = ["'self'", cspSource, ...connectSources].join(" ");
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`,
    `font-src ${cspSource} data:`,
    // React and uPlot both set inline styles; Vite also inlines small CSS.
    `style-src ${cspSource} 'unsafe-inline'`,
    // No 'unsafe-eval': the bundle generates no code at runtime. See above
    // before adding a dependency that would.
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `worker-src ${cspSource} blob:`,
    `connect-src ${connect}`,
  ].join("; ");

  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    `<script nonce="${nonce}">${bootstrapScript(init)}</script>`,
  ].join("\n    ");

  if (out.includes("</head>")) {
    return out.replace("</head>", `    ${head}\n  </head>`);
  }
  return `${head}\n${out}`;
}

/**
 * The inline bootstrap injected ahead of the bundle.
 *
 * Besides publishing `__GSIM_INIT__` it does two load-bearing things:
 *
 * 1. calls `acquireVsCodeApi()` exactly once and stashes the handle — the API
 *    throws if called twice, and both the bundle and this bootstrap need it;
 * 2. installs `error` / `unhandledrejection` handlers that report back as
 *    `gsim/log`. Without this, a bundle that fails to load (bad asset URI, CSP
 *    violation, module resolution error) is *completely silent*: the webview
 *    just stays blank and any test waiting on it times out with no clue why.
 */
export function bootstrapScript(init: WebviewInit): string {
  return [
    `window.${GSIM_INIT_GLOBAL} = ${jsonForScript(init)};`,
    "(function () {",
    "  try { window.__GSIM_VSCODE_API__ = acquireVsCodeApi(); } catch (e) {}",
    "  var api = window.__GSIM_VSCODE_API__;",
    "  function report(level, message) {",
    "    try { api && api.postMessage({ type: 'gsim/log', level: level, message: message }); }",
    "    catch (e) {}",
    "  }",
    "  window.addEventListener('error', function (e) {",
    "    report('error', 'window.onerror: ' + (e.message || e.type) +",
    "      ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0));",
    "  }, true);",
    "  window.addEventListener('unhandledrejection', function (e) {",
    "    report('error', 'unhandledrejection: ' + String(e.reason));",
    "  });",
    "  report('info', 'bootstrap ran');",
    "  window.addEventListener('DOMContentLoaded', function () {",
    "    report('info', 'DOMContentLoaded, scripts=' +",
    "      document.querySelectorAll('script').length);",
    "  });",
    "})();",
  ].join("\n");
}

/** JSON safe to embed inside a `<script>` element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Origins the webview must be allowed to reach for the kernel sidecar.
 *
 * Deliberately port-wildcarded: the sidecar binds `--port 0`, so a restart
 * lands on a different port, while a webview's CSP is fixed at the moment its
 * HTML is set. Scoped to loopback only.
 */
export function kernelConnectSources(): string[] {
  return ["ws://127.0.0.1:*", "http://127.0.0.1:*", "ws://localhost:*", "http://localhost:*"];
}
