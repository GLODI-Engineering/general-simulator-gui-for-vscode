/**
 * Entry point for the **browser dev harness** — not a shipped surface.
 *
 * The product is the VS Code extension: its three webviews boot from
 * `src/vscode/{schematic,library,waveform}-main.tsx`. This harness exists so
 * the canvas can be developed with Vite HMR and exercised by Playwright
 * (`tests/e2e/`) without launching an extension host, which is far slower and
 * cannot be driven headlessly. It talks to the stub kernel unless
 * `VITE_IPC_TRANSPORT=ws` points it at a real sidecar.
 *
 * Nothing here ships in the .vsix — see `apps/vscode-extension/.vscodeignore`.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./shell/ErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary label="the application">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
