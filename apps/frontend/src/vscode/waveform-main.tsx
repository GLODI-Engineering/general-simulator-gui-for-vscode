/**
 * Entry point for the waveform/results webview panel.
 *
 * This is a *panel* opened by the `General Simulator: Show Waveforms` command,
 * not a file-backed Custom Editor, because simulation results are not a
 * user-facing document: `packages/simulator/postprocess/result_writer.py`
 * writes them to `<sidecar workdir>/results/<sim_id>/` — an app-private cache
 * under `$XDG_DATA_HOME/general-simulator/`, outside the workspace, keyed by an
 * in-memory sim id, and readable only through the running kernel sidecar's
 * token-gated HTTP slice server. There is nothing in the Explorer to
 * double-click, and VS Code's dirty/save/revert lifecycle would be a lie for
 * read-only derived data.
 */
import React from "react";
import ReactDOM from "react-dom/client";

import { initKernelFromVsCode } from "../ipc/transport";
import { onHostMessage, postToHost } from "../ipc/vscode-host";
import { ErrorBoundary } from "../shell/ErrorBoundary";
import { useIpcStore } from "../store";
import { WaveformTab } from "../waveform/WaveformTab";
import { installTestHooks } from "./test-hooks";

import "../styles/app.css";

function boot(): void {
  initKernelFromVsCode();

  onHostMessage((message) => {
    if (message.type === "gsim/showSimulation") {
      const current = useIpcStore.getState().lastManifest;
      if (current?.sim_id !== message.simId) {
        useIpcStore.getState().setLastManifest({
          sim_id: message.simId,
          signals: [],
          t_start: 0,
          t_end: 0,
        });
      }
    }
  });

  installTestHooks();

  const root = document.getElementById("root");
  if (!root) throw new Error("#root element missing");

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary label="the waveform viewer">
        <WaveformTab />
      </ErrorBoundary>
    </React.StrictMode>,
  );

  postToHost({ type: "gsim/ready", role: "waveform" });
}

boot();
