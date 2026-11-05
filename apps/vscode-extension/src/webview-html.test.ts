import { describe, expect, it } from "vitest";

import { kernelConnectSources, makeNonce, rewriteWebviewHtml } from "./webview-html";

const HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="modulepreload" crossorigin href="./assets/shared.js">
    <link rel="stylesheet" crossorigin href="./assets/schematic.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./assets/schematic.js"></script>
  </body>
</html>`;

function render(html = HTML) {
  return rewriteWebviewHtml(html, {
    toWebviewUri: (assetPath) => `https://webview.test/${assetPath}`,
    cspSource: "vscode-webview-resource:",
    nonce: "TESTNONCE",
    init: { role: "schematic", documentText: '{"model":{}}' },
    connectSources: kernelConnectSources(),
  });
}

describe("rewriteWebviewHtml", () => {
  it("rewrites script and stylesheet references through asWebviewUri", () => {
    const out = render();
    expect(out).toContain('src="https://webview.test/assets/schematic.js"');
    expect(out).toContain('href="https://webview.test/assets/schematic.css"');
    expect(out).toContain('href="https://webview.test/assets/shared.js"');
    expect(out).not.toContain("./assets/");
  });

  it("strips Vite's crossorigin attributes, which break on the webview origin", () => {
    expect(render()).not.toContain("crossorigin");
  });

  it("nonces every script tag", () => {
    const out = render();
    const scripts = out.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) {
      expect(tag).toContain('nonce="TESTNONCE"');
    }
  });

  it("injects a CSP that allows the loopback kernel sidecar on any port", () => {
    const out = render();
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("default-src 'none'");
    expect(out).toContain("ws://127.0.0.1:*");
    expect(out).toContain("http://127.0.0.1:*");
    expect(out).toContain("script-src 'nonce-TESTNONCE'");
  });

  it("does not allow 'unsafe-eval'", () => {
    // The webview bundle compiles its Ajv validators ahead of time and parses
    // param expressions with a real parser, so nothing in it generates code at
    // runtime. Re-adding this directive would be a silent loss of the property
    // those two pieces of work exist to provide.
    const out = render();
    expect(out).not.toContain("unsafe-eval");
    expect(out).toContain(`script-src 'nonce-TESTNONCE' vscode-webview-resource:;`);
  });

  it("keeps the rest of the CSP strict", () => {
    const out = render();
    expect(out).toContain("default-src 'none'");
    // No blanket script-src, no remote origins beyond the webview's own.
    expect(out).not.toContain("script-src *");
    expect(out).not.toContain("default-src *");
  });

  it("acquires the webview API once in the bootstrap and reports load errors", () => {
    const out = render();
    expect(out).toContain("acquireVsCodeApi()");
    expect(out).toContain("__GSIM_VSCODE_API__");
    expect(out).toContain("unhandledrejection");
    expect(out).toContain("window.onerror");
  });

  it("injects the __GSIM_INIT__ bootstrap payload", () => {
    const out = render();
    expect(out).toContain("window.__GSIM_INIT__ =");
    expect(out).toContain("\\u0022role\\u0022".replace(/\\u0022/g, '"'));
    expect(out).toContain('"role":"schematic"');
  });

  it("escapes angle brackets so payload text cannot break out of the script tag", () => {
    const out = rewriteWebviewHtml(HTML, {
      toWebviewUri: (p) => p,
      cspSource: "csp:",
      nonce: "N",
      init: { role: "library", documentText: "</script><script>alert(1)</script>" },
      connectSources: [],
    });
    expect(out).not.toContain("</script><script>alert(1)");
    expect(out).toContain("\\u003c/script");
  });

  it("still injects the head block when the document has no </head>", () => {
    const out = rewriteWebviewHtml("<body><div id=root></div></body>", {
      toWebviewUri: (p) => p,
      cspSource: "csp:",
      nonce: "N",
      init: { role: "waveform" },
      connectSources: [],
    });
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("window.__GSIM_INIT__");
  });
});

describe("makeNonce", () => {
  it("returns 32 alphanumeric characters that differ between calls", () => {
    const a = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(makeNonce()).not.toBe(a);
  });
});
