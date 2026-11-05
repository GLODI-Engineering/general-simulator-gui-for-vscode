/**
 * Entry point for the block-library webview hosted by VS Code's Activity Bar
 * view container (`generalSimulator.library`, a `type: "webview"` view).
 *
 * This is `library/LibraryActivity.tsx` with no `PrimarySideBar` wrapper —
 * VS Code supplies the sidebar chrome, the title and the collapse affordance.
 */
import React from "react";
import ReactDOM from "react-dom/client";

import { installCrossWebviewDnd } from "../canvas/dnd";
import { initKernelFromVsCode } from "../ipc/transport";
import { getWebviewInit, onHostMessage, postToHost } from "../ipc/vscode-host";
import { LibraryActivity } from "../library/LibraryActivity";
import { loadCatalogFromManifest } from "../library/catalog";
import { mergeUserSymbols } from "../symbol-editor/save";
import { setRemoteInsertHandler } from "../library/insert";
import { ErrorBoundary } from "../shell/ErrorBoundary";
import { useLibraryStore } from "../store";
import { installTestHooks } from "./test-hooks";

import "../styles/app.css";

function boot(): void {
  initKernelFromVsCode();

  // Publishes library drags to the extension host, which relays the payload to
  // the schematic webview — plain HTML5 DnD cannot cross the webview boundary.
  installCrossWebviewDnd();

  // Click-to-insert: this webview owns no graph, so the host relays the
  // insertion to whichever schematic custom editor is active.
  setRemoteInsertHandler((metadata) => {
    postToHost({ type: "gsim/insertBlock", blockName: metadata.name });
  });

  installTestHooks();

  if (Object.keys(useLibraryStore.getState().catalog).length === 0) {
    useLibraryStore.getState().setCatalog(loadCatalogFromManifest());
  }

  // User components are files in the workspace. The host reads them before
  // this bundle runs and puts them in the init payload, so they are in the
  // library from the first paint rather than popping in afterwards; the
  // subscription below keeps up with edits made on disk.
  mergeUserSymbols(getWebviewInit()?.userSymbols ?? []);
  onHostMessage((message) => {
    if (message.type === "gsim/userSymbols") {
      mergeUserSymbols(message.metadata);
    }
  });

  const root = document.getElementById("root");
  if (!root) throw new Error("#root element missing");

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary label="the block library">
        <LibraryActivity />
      </ErrorBoundary>
    </React.StrictMode>,
  );

  postToHost({ type: "gsim/ready", role: "library" });
}

boot();
