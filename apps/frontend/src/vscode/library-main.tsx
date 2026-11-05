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
import { postToHost } from "../ipc/vscode-host";
import { LibraryActivity } from "../library/LibraryActivity";
import { loadCatalogFromManifest } from "../library/catalog";
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
