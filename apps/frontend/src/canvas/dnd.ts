import { onHostMessage, postToHost } from "../ipc/vscode-host";

export const DND_BLOCK_TYPE = "application/x-gensim-block";

/**
 * Module-level tracker for the block currently being dragged.
 *
 * Two reasons this exists rather than relying on `dataTransfer`:
 *
 * 1. WebKitGTK (Tauri on Linux) does not reliably expose custom MIME type data
 *    via `dataTransfer.getData()` in the drop handler.
 * 2. Under VS Code the library sidebar and the schematic canvas are two
 *    *separate, isolated webview iframes*. Chromium still routes the native
 *    drag's `dragover`/`drop` events to whichever frame is under the cursor,
 *    but `dataTransfer.getData()` for a custom MIME type is not readable
 *    across that boundary. The payload therefore travels out-of-band through
 *    the extension host (see `installCrossWebviewDnd`), while the native drag
 *    only supplies the pointer.
 */
let activeDragBlock: string | null = null;

/** True once this webview has been wired to the extension-host drag bridge. */
let bridgeInstalled = false;
let disposeBridge: (() => void) | null = null;

/** Listeners notified whenever the active drag block changes (either source). */
const dragStateListeners = new Set<(blockName: string | null) => void>();

function notify(blockName: string | null): void {
  for (const listener of dragStateListeners) {
    listener(blockName);
  }
}

/**
 * Called by the *drag source* (the library sidebar). When the cross-webview
 * bridge is installed this also broadcasts the payload to the extension host
 * so the schematic webview can pick it up.
 */
export function setActiveDragBlock(name: string | null, label?: string): void {
  activeDragBlock = name;
  if (bridgeInstalled) {
    if (name === null) {
      postToHost({ type: "gsim/dragEnd" });
    } else {
      postToHost({ type: "gsim/dragStart", blockName: name, label: label ?? name });
    }
  }
  notify(name);
}

export function getActiveDragBlock(): string | null {
  return activeDragBlock;
}

/**
 * Called by the drag *target* when the payload arrives from the extension host
 * rather than from a same-document `dragstart`. Deliberately does not echo the
 * value back to the host.
 */
export function applyRemoteDragBlock(name: string | null): void {
  activeDragBlock = name;
  notify(name);
}

export function subscribeDragState(listener: (blockName: string | null) => void): () => void {
  dragStateListeners.add(listener);
  return () => {
    dragStateListeners.delete(listener);
  };
}

/**
 * Wire this webview into the extension host's drag broker.
 *
 * Call once per webview, from the VS Code entry points. The library view uses
 * it to *publish* drags; the schematic view uses it to *receive* them. Both
 * directions are installed by the same call — a webview simply never receives
 * its own broadcast (the host does not echo back to the sender).
 *
 * Returns a disposer; calling twice is a no-op.
 */
export function installCrossWebviewDnd(): () => void {
  if (bridgeInstalled) {
    return () => {
      /* already installed */
    };
  }
  bridgeInstalled = true;
  const unsubscribe = onHostMessage((message) => {
    if (message.type === "gsim/dragState") {
      applyRemoteDragBlock(message.blockName);
    }
  });
  disposeBridge = () => {
    unsubscribe();
    bridgeInstalled = false;
    disposeBridge = null;
  };
  return disposeBridge;
}

/** Test seam. */
export function resetDndBridge(): void {
  disposeBridge?.();
  bridgeInstalled = false;
  activeDragBlock = null;
  dragStateListeners.clear();
}

export function encodeBlockPayload(blockName: string): string {
  return JSON.stringify({ blockName });
}

export function decodeBlockPayload(raw: string): { blockName: string } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "blockName" in parsed &&
      typeof (parsed as { blockName: unknown }).blockName === "string"
    ) {
      return { blockName: (parsed as { blockName: string }).blockName };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the dragged block for a drop event, trying every transport in order
 * of reliability:
 *
 * 1. the custom MIME type (same-document drags),
 * 2. `text/plain` (readable across the webview iframe boundary),
 * 3. the module tracker, which the extension-host bridge keeps up to date for
 *    cross-webview drags.
 */
export function resolveDroppedBlock(dataTransfer: DataTransfer | null): string | null {
  if (dataTransfer) {
    try {
      const custom = dataTransfer.getData(DND_BLOCK_TYPE);
      const decoded = custom ? decodeBlockPayload(custom) : null;
      if (decoded) {
        return decoded.blockName;
      }
      const plain = dataTransfer.getData("text/plain");
      if (plain) {
        return plain;
      }
    } catch {
      // Cross-origin webview drags reject getData(); fall through to the bridge.
    }
  }
  return activeDragBlock;
}

export function snapToGrid(x: number, y: number, grid: number): [number, number] {
  return [Math.round(x / grid) * grid, Math.round(y / grid) * grid];
}

export function screenToModelCoords(
  screenX: number,
  screenY: number,
  canvasRect: DOMRect,
  pan: { x: number; y: number },
  zoom: number,
  grid: number,
): [number, number] {
  const modelX = (screenX - canvasRect.left - pan.x) / zoom;
  const modelY = (screenY - canvasRect.top - pan.y) / zoom;
  return snapToGrid(modelX, modelY, grid);
}
