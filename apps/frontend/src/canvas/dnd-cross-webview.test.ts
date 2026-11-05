/**
 * Cross-webview drag-and-drop bridge.
 *
 * Under VS Code the library sidebar and the schematic canvas are two isolated
 * webview iframes. VS Code exposes no webview drop-MIME API (`dropMimeTypes`
 * lives on `TreeDragAndDropController` and `DocumentDropEditProvider` only), so
 * the native drag carries the pointer while the extension host carries the
 * payload. These tests cover both halves of that bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setVsCodeApi } from "../ipc/vscode-host";
import {
  DND_BLOCK_TYPE,
  encodeBlockPayload,
  getActiveDragBlock,
  installCrossWebviewDnd,
  resetDndBridge,
  resolveDroppedBlock,
  setActiveDragBlock,
  subscribeDragState,
} from "./dnd";

const posted: unknown[] = [];

function fakeDataTransfer(entries: Record<string, string>, throwOnGet = false): DataTransfer {
  return {
    getData(type: string) {
      if (throwOnGet) {
        throw new Error("cross-origin webview drag");
      }
      return entries[type] ?? "";
    },
  } as unknown as DataTransfer;
}

/** Simulate the extension host pushing a message into this webview. */
function hostSays(message: unknown): void {
  globalThis.dispatchEvent(new MessageEvent("message", { data: message }));
}

beforeEach(() => {
  posted.length = 0;
  setVsCodeApi({
    postMessage: (message: unknown) => {
      posted.push(message);
    },
    getState: () => null,
    setState: (state: unknown) => state,
  });
});

afterEach(() => {
  resetDndBridge();
  setVsCodeApi(null);
});

describe("drag source (library webview)", () => {
  it("does not talk to the host until the bridge is installed", () => {
    setActiveDragBlock("passive.resistor");
    expect(posted).toEqual([]);
    expect(getActiveDragBlock()).toBe("passive.resistor");
  });

  it("publishes gsim/dragStart with the block payload once bridged", () => {
    installCrossWebviewDnd();
    setActiveDragBlock("passive.resistor", "Resistor");
    expect(posted).toEqual([
      { type: "gsim/dragStart", blockName: "passive.resistor", label: "Resistor" },
    ]);
  });

  it("falls back to the block name when no label is given", () => {
    installCrossWebviewDnd();
    setActiveDragBlock("passive.capacitor");
    expect(posted[0]).toMatchObject({ label: "passive.capacitor" });
  });

  it("publishes gsim/dragEnd when the drag is cleared", () => {
    installCrossWebviewDnd();
    setActiveDragBlock("passive.resistor");
    setActiveDragBlock(null);
    expect(posted.at(-1)).toEqual({ type: "gsim/dragEnd" });
  });
});

describe("drop target (schematic webview)", () => {
  it("adopts the block broadcast by the extension host", () => {
    installCrossWebviewDnd();
    expect(getActiveDragBlock()).toBeNull();
    hostSays({ type: "gsim/dragState", blockName: "source.voltage.dc", label: "V (DC)" });
    expect(getActiveDragBlock()).toBe("source.voltage.dc");
  });

  it("clears the block when the host reports the drag ended", () => {
    installCrossWebviewDnd();
    hostSays({ type: "gsim/dragState", blockName: "source.voltage.dc" });
    hostSays({ type: "gsim/dragState", blockName: null });
    expect(getActiveDragBlock()).toBeNull();
  });

  it("does not echo host-originated drags back to the host", () => {
    installCrossWebviewDnd();
    hostSays({ type: "gsim/dragState", blockName: "source.voltage.dc" });
    expect(posted).toEqual([]);
  });

  it("ignores unrelated window messages", () => {
    installCrossWebviewDnd();
    hostSays({ type: "something/else", blockName: "nope" });
    hostSays("not-an-object");
    expect(getActiveDragBlock()).toBeNull();
  });

  it("stops listening once disposed", () => {
    const dispose = installCrossWebviewDnd();
    dispose();
    hostSays({ type: "gsim/dragState", blockName: "source.voltage.dc" });
    expect(getActiveDragBlock()).toBeNull();
  });

  it("is idempotent — a second install does not double-subscribe", () => {
    installCrossWebviewDnd();
    installCrossWebviewDnd();
    const seen: Array<string | null> = [];
    subscribeDragState((name) => seen.push(name));
    hostSays({ type: "gsim/dragState", blockName: "passive.resistor" });
    expect(seen).toEqual(["passive.resistor"]);
  });
});

describe("resolveDroppedBlock transport fallback", () => {
  it("prefers the custom MIME payload (same-document drag)", () => {
    setActiveDragBlock("stale.block");
    const dt = fakeDataTransfer({
      [DND_BLOCK_TYPE]: encodeBlockPayload("passive.resistor"),
      "text/plain": "ignored",
    });
    expect(resolveDroppedBlock(dt)).toBe("passive.resistor");
  });

  it("falls back to text/plain, which survives the iframe boundary", () => {
    const dt = fakeDataTransfer({ "text/plain": "passive.capacitor" });
    expect(resolveDroppedBlock(dt)).toBe("passive.capacitor");
  });

  it("falls back to the host-brokered block when getData is empty", () => {
    installCrossWebviewDnd();
    hostSays({ type: "gsim/dragState", blockName: "source.voltage.dc" });
    expect(resolveDroppedBlock(fakeDataTransfer({}))).toBe("source.voltage.dc");
  });

  it("falls back to the host-brokered block when getData throws cross-origin", () => {
    installCrossWebviewDnd();
    hostSays({ type: "gsim/dragState", blockName: "source.voltage.dc" });
    expect(resolveDroppedBlock(fakeDataTransfer({}, true))).toBe("source.voltage.dc");
  });

  it("returns null when nothing is being dragged", () => {
    expect(resolveDroppedBlock(null)).toBeNull();
    expect(resolveDroppedBlock(fakeDataTransfer({}))).toBeNull();
  });

  it("ignores a malformed custom payload and keeps looking", () => {
    const dt = fakeDataTransfer({ [DND_BLOCK_TYPE]: "{not json", "text/plain": "passive.diode" });
    expect(resolveDroppedBlock(dt)).toBe("passive.diode");
  });
});

describe("subscribeDragState", () => {
  it("notifies on local and remote changes and unsubscribes cleanly", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDragState(listener);
    setActiveDragBlock("a");
    unsubscribe();
    setActiveDragBlock("b");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("a");
  });
});
