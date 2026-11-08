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
import { getWebviewInit, postToHost, requestSource } from "../ipc/vscode-host";
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

/**
 * Drag a component out of the *toolbar* and drop it on the canvas, inside
 * this one webview.
 *
 * Distinct from `dispatchCanvasDrop`, which models the cross-webview case
 * with an empty DataTransfer and the payload arriving through the host. Here
 * source and target are in the same document, so the whole gesture —
 * `dragstart`, `dragover`, `drop` — shares one DataTransfer, which is what a
 * hand produces and what the toolbar had no handler for until #3.
 */
function dispatchToolbarDrag(args: Record<string, unknown>): unknown {
  const button = el(".schematic-toolbar__component") as HTMLElement | null;
  const target = el(".canvas-flow") as HTMLElement | null;
  if (!button) throw new Error("no toolbar component button present");
  if (!target) throw new Error("canvas-flow element not present");

  const rect = target.getBoundingClientRect();
  const clientX = typeof args.clientX === "number" ? args.clientX : rect.left + 200;
  const clientY = typeof args.clientY === "number" ? args.clientY : rect.top + 160;

  const before = useGraphStore.getState().document.model.blocks.length;
  const transfer = new DataTransfer();

  button.dispatchEvent(
    new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }),
  );
  const draggedAfterStart = getActiveDragBlock();

  target.dispatchEvent(
    new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      dataTransfer: transfer,
    }),
  );
  target.dispatchEvent(
    new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      dataTransfer: transfer,
    }),
  );

  const after = useGraphStore.getState().document.model.blocks.length;
  return {
    before,
    after,
    inserted: after - before,
    lastBlockType: useGraphStore.getState().document.model.blocks.at(-1)?.type ?? null,
    // Proof the fix is in this build at all, rather than the drag merely
    // failing for some other reason.
    draggableAttr: button.getAttribute("draggable"),
    draggedAfterStart,
  };
}

/**
 * Ask the extension host for a workspace file, the way the inspector does
 * when it offers to read a scripted block's ports from its source.
 *
 * Exists so the host half of that round trip can be tested at all: the
 * browser suite has no extension host, so without this the file read, the
 * workspace confinement and the reply are covered by nothing.
 */
async function readSourceProbe(args: Record<string, unknown>): Promise<unknown> {
  const path = typeof args.path === "string" ? args.path : "";
  const text = await requestSource(path, 10_000);
  return { ok: text !== null, length: text?.length ?? 0, text: text?.slice(0, 400) ?? null };
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
  dispatchToolbarDrag,
  readSource: readSourceProbe,

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
      // Awaited, because a probe may be async — asking the extension host
      // for a file is. Posting the Promise itself fails at the boundary
      // with "[object Promise] could not be cloned", which reads as a
      // broken probe rather than a missing `await`.
      void Promise.resolve(probe(data.args ?? {}))
        .then((result) => {
          postToHost({ type: "gsim/test/report", requestId, ok: true, result });
        })
        .catch((error: unknown) => {
          postToHost({
            type: "gsim/test/report",
            requestId,
            ok: false,
            result: String(error instanceof Error ? error.message : error),
          });
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
