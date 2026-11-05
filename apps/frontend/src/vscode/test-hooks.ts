/**
 * Integration-harness probes, installed only when the extension host sets
 * `__GSIM_INIT__.testMode` (it does that solely under
 * `@vscode/test-electron`, gated on the `GSIM_INTEGRATION_TEST` env var).
 *
 * These let an integration test reach into a *real* webview — real Chromium,
 * real bundle, real React tree, real zustand stores — and assert on concrete
 * state rather than on the absence of errors in a log. Every probe travels the
 * production `postMessage` path through `GsimHost`, so the harness exercises
 * the same fan-out the product uses.
 */
import { getActiveDragBlock, setActiveDragBlock } from "../canvas/dnd";
import { serialize } from "../file/serializer";
import { getWebviewInit, postToHost } from "../ipc/vscode-host";
import { useGraphStore, useLibraryStore } from "../store";

type Probe = (args: Record<string, unknown>) => unknown;

function el(selector: string): Element | null {
  return document.querySelector(selector);
}

/**
 * Dispatch a real `drop` DragEvent on the canvas, with an *empty*
 * `DataTransfer` — exactly the situation a cross-webview drag produces, where
 * `getData()` yields nothing and the payload must come from the extension
 * host's `gsim/dragState` broadcast.
 */
function dispatchCanvasDrop(args: Record<string, unknown>): unknown {
  const target = el(".canvas-flow") as HTMLElement | null;
  if (!target) {
    throw new Error("canvas-flow element not present");
  }
  const rect = target.getBoundingClientRect();
  const clientX = typeof args.clientX === "number" ? args.clientX : rect.left + 120;
  const clientY = typeof args.clientY === "number" ? args.clientY : rect.top + 120;

  const before = useGraphStore.getState().document.model.blocks.length;
  const event = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    dataTransfer: new DataTransfer(),
  });
  target.dispatchEvent(event);
  const after = useGraphStore.getState().document.model.blocks.length;

  return {
    before,
    after,
    inserted: after - before,
    lastBlockType: useGraphStore.getState().document.model.blocks.at(-1)?.type ?? null,
    canvasRect: { width: rect.width, height: rect.height },
  };
}

const PROBES: Record<string, Probe> = {
  /** Proof the React app actually mounted and painted inside this webview. */
  mounted: () => {
    const root = document.getElementById("root");
    return {
      role: getWebviewInit()?.role ?? null,
      rootExists: root !== null,
      childElementCount: root?.childElementCount ?? 0,
      textLength: (root?.textContent ?? "").length,
      hasCanvas: el(".canvas-flow") !== null,
      hasLibrary: el(".library-activity") !== null,
      hasLibraryItems: document.querySelectorAll(".library-item").length,
      hasWaveform: el(".waveform-tab") !== null || el(".waveform-empty") !== null,
      hasMainToolbar: el(".main-toolbar") !== null,
    };
  },

  /** Number of catalog entries the webview loaded from the manifest. */
  catalogSize: () => Object.keys(useLibraryStore.getState().catalog).length,

  /** Read the module-level drag tracker that the host bridge writes into. */
  dragState: () => getActiveDragBlock(),

  /**
   * Drive the *production* drag-source path: this is exactly what
   * `SidebarItem.onDragStart` calls, so it posts a real `gsim/dragStart` to
   * the extension host.
   */
  simulateDragStart: (args) => {
    const blockName = String(args.blockName ?? "");
    setActiveDragBlock(blockName, args.label ? String(args.label) : undefined);
    return getActiveDragBlock();
  },

  simulateDragEnd: () => {
    setActiveDragBlock(null);
    return getActiveDragBlock();
  },

  dispatchCanvasDrop,

  /**
   * Click a real MainToolbar button by its accessible name, so the whole
   * production path runs: React onClick -> App.handleAction ->
   * handleHostFileAction -> postToHost. Used to prove the in-app Save button
   * really funnels into VS Code's own save rather than the storage adapter.
   */
  clickToolbarButton: (args) => {
    const label = String(args.label ?? "");
    const button = [...document.querySelectorAll<HTMLButtonElement>(".main-toolbar button")].find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    if (!button) {
      throw new Error(`no .main-toolbar button labelled "${label}"`);
    }
    button.click();
    return { clicked: label };
  },

  blockCount: () => useGraphStore.getState().document.model.blocks.length,

  documentName: () => useGraphStore.getState().document.model.name,

  documentText: () => serialize(useGraphStore.getState().document),

  /** Mutate the graph so the custom editor's dirty-state wiring is exercised. */
  renameModel: (args) => {
    const graph = useGraphStore.getState();
    const current = graph.document;
    graph.loadDocument({
      ...current,
      model: { ...current.model, name: String(args.name ?? "renamed") },
    });
    return graph.document.model.name;
  },
};

export function installTestHooks(): void {
  if (!getWebviewInit()?.testMode) {
    return;
  }
  globalThis.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as
      | { type?: string; requestId?: string; op?: string; args?: Record<string, unknown> }
      | undefined;
    if (!data || data.type !== "gsim/test/exec" || typeof data.requestId !== "string") {
      return;
    }
    const requestId = data.requestId;
    try {
      const probe = PROBES[String(data.op)];
      if (!probe) {
        throw new Error(`unknown probe: ${String(data.op)}`);
      }
      postToHost({
        type: "gsim/test/report",
        requestId,
        ok: true,
        result: probe(data.args ?? {}),
      });
    } catch (error) {
      postToHost({
        type: "gsim/test/report",
        requestId,
        ok: false,
        result: String(error),
      });
    }
  });
}
