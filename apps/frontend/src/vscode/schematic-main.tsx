/**
 * Entry point for the schematic webview hosted by the VS Code Custom Editor
 * Provider (`generalSimulator.schematic`, registered for `*.gsim_sch`).
 *
 * Responsibilities:
 * - bootstrap the kernel sidecar connection from the extension host,
 * - install the cross-webview drag bridge so library drags land here,
 * - own the `.gsim_sch` document lifecycle handshake (load / dirty / save /
 *   revert) against the Custom Editor API on the host side.
 */
import React from "react";
import ReactDOM from "react-dom/client";

import App from "../App";
import { installCrossWebviewDnd } from "../canvas/dnd";
import { deserialize } from "../file/deserializer";
import { serialize } from "../file/serializer";
import { initKernelFromVsCode } from "../ipc/transport";
import { getWebviewInit, onHostMessage, postToHost } from "../ipc/vscode-host";
import { followVsCodeTheme } from "../ipc/vscode-theme";
import { loadCatalogFromManifest } from "../library/catalog";
import { insertCatalogBlock } from "../library/insert";
import { ErrorBoundary } from "../shell/ErrorBoundary";
import { useGraphStore, useIpcStore, useLibraryStore } from "../store";
import { mergeUserSymbols } from "../symbol-editor/save";
import { installTestHooks } from "./test-hooks";

/** Tracks the text last synced with the host so we do not echo host writes back. */
let lastSyncedText: string | null = null;

function loadDocumentText(text: string): void {
  const parsed = deserialize(text);
  useGraphStore.getState().loadDocument(parsed);
  useGraphStore.getState().clearHistory();
  lastSyncedText = text;
}

function currentDocumentText(): string {
  return serialize(useGraphStore.getState().document);
}

function installDocumentBridge(): () => void {
  const unsubscribeHost = onHostMessage((message) => {
    if (message.type === "gsim/setDocument") {
      loadDocumentText(message.text);
    } else if (message.type === "gsim/requestDocument") {
      const text = currentDocumentText();
      lastSyncedText = text;
      postToHost({ type: "gsim/documentContent", requestId: message.requestId, text });
    } else if (message.type === "gsim/insertBlock") {
      const metadata = useLibraryStore.getState().catalog[message.blockName];
      if (metadata) {
        insertCatalogBlock(metadata);
      }
    }
  });

  // Any graph mutation marks the VS Code editor dirty via
  // onDidChangeCustomDocument on the host side.
  const unsubscribeGraph = useGraphStore.subscribe((state, previous) => {
    if (state.document === previous.document) {
      return;
    }
    const text = serialize(state.document);
    if (text === lastSyncedText) {
      return;
    }
    lastSyncedText = text;
    postToHost({
      type: "gsim/documentChanged",
      text,
      label: state.undoStack.at(-1)?.name ?? "edit",
    });
  });

  // Surface finished simulations so the waveform panel can attach to them.
  const unsubscribeIpc = useIpcStore.subscribe((state, previous) => {
    const simId = state.lastManifest?.sim_id;
    if (simId && simId !== previous.lastManifest?.sim_id) {
      postToHost({ type: "gsim/simulationFinished", simId });
    }
  });

  return () => {
    unsubscribeHost();
    unsubscribeGraph();
    unsubscribeIpc();
  };
}

function boot(): void {
  followVsCodeTheme();
  initKernelFromVsCode();
  installCrossWebviewDnd();

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

  const init = getWebviewInit();
  if (typeof init?.documentText === "string" && init.documentText.trim().length > 0) {
    try {
      loadDocumentText(init.documentText);
    } catch (error) {
      postToHost({
        type: "gsim/log",
        level: "error",
        message: `failed to parse schematic: ${String(error)}`,
      });
    }
  }

  installTestHooks();

  installDocumentBridge();

  const root = document.getElementById("root");
  if (!root) throw new Error("#root element missing");

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary label="the schematic editor">
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );

  postToHost({ type: "gsim/ready", role: "schematic" });
}

boot();
