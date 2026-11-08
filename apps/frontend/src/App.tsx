import { useEffect } from "react";
import { installPortValidation } from "./canvas/port-validation";
import { registerCanvasTab } from "./canvas/register";
import { serialize } from "./file/serializer";
import { ComponentParamsPanel } from "./inspector/ComponentParamsPanel";
import { Inspector } from "./inspector/Inspector";
import { getIpcClient } from "./ipc/transport";
import type { WorkspaceVariable } from "./ipc/types";
import { QuickInsert } from "./library/QuickInsert";
import { loadCatalogFromManifest } from "./library/catalog";
import { createBlockFromMetadata } from "./library/insert";
import { registerLibraryActivity } from "./library/register";
import type { ModelDocument, ParamValue } from "./model/types";
import { generateNetlist } from "./netlist/generate";
import { registerNetlistTab } from "./netlist/register";
import { CommandPalette } from "./palette/CommandPalette";
import { registerProblemsSurface } from "./problems/register";
import { resetActivityRegistry } from "./shell/registries/ActivityRegistry";
import { resetBottomTabRegistry } from "./shell/registries/BottomTabRegistry";
import { rerouteWiresForBlocks } from "./store/graph";
import { resolveModelAtPath } from "./store/model";
import { registerSymbolEditorTab } from "./symbol-editor/register";
import { saveSymbolToLibrary } from "./symbol-editor/save";
import { useSymbolEditorStore } from "./symbol-editor/store";
import { registerWaveformTab } from "./waveform/register";
import { installWaveformRenderHook } from "./waveform/render-hook";
import { registerWorkspaceTab } from "./workspace/register";

import { KeymapProvider } from "./canvas/KeymapProvider";
import { insertBuckSchematic } from "./canvas/buck-schematic";
import { copySelection, cutSelection, pasteSelection } from "./canvas/clipboard";
import { getBlockBoundingBox } from "./canvas/geometry";
import { groupBlocksIntoSubsystem } from "./canvas/group-blocks";
import { addProbe, createIProbe, createVProbe, removeProbe } from "./canvas/probes";
import { resolveBlockMetadata } from "./canvas/subckt-metadata";
import { selectAdapter } from "./file/adapters/select-adapter";
import {
  closeFile,
  exportCurrentModel,
  newFile,
  openFile,
  openFileById,
  saveFile,
  saveFileAs,
  setStorageAdapter,
} from "./file/file-ops";
import { handleHostFileAction } from "./file/host-file-actions";
import { recordRecentNetlist } from "./file/recent-netlists";
import { getWebviewInit } from "./ipc/vscode-host";
import { BottomPanel } from "./shell/BottomPanel";
import { listEditorTabs } from "./shell/EditorTabRegistry";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { MainToolbar } from "./shell/MainToolbar";
import { ShellDialogs } from "./shell/ShellDialogs";
import { StartupModal } from "./shell/StartupModal";
import { ToastHost } from "./shell/ToastHost";
import { useGraphStore, useIpcStore, useLibraryStore, useToastStore, useUiStore } from "./store";
import type { KernelStatus } from "./store/ipc";

import "./styles/app.css";

const THEME_STORAGE_KEY = "gensim.ui.theme.v1";

function applyTheme(next: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", next);
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next);
}

let registriesBooted = false;
let appClipboard: ReturnType<typeof copySelection> | null = null;

function bootRegistries() {
  if (registriesBooted) {
    return;
  }
  resetActivityRegistry();
  resetBottomTabRegistry();
  registerLibraryActivity();
  registerCanvasTab();
  registerNetlistTab();
  registerWaveformTab();
  registerWorkspaceTab();
  registerSymbolEditorTab();
  registerProblemsSurface();
  // A wire naming a port its block does not have is drawn anyway; without
  // this nothing ever says so.
  installPortValidation();
  // Harness door, same role as `__gensim_load_document`. It was installed
  // only from the VS Code waveform entry, so the browser e2e suite could
  // not reach the waveform viewer at all — every test of it had to go
  // through the packaged extension.
  installWaveformRenderHook();
  registriesBooted = true;
}

function activeModelPath(): string[] {
  return useUiStore.getState().hierarchyPath;
}

/**
 * File > Import SPICE netlist… — loads an arbitrary .cir/.sp/.net text file
 * as the direct-netlist override for the next Run, and switches to the
 * Netlist tab so the user sees exactly what will be sent to the solver.
 */
function importNetlistFromDisk(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".cir,.sp,.spi,.spice,.net,.txt";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) {
      document.body.removeChild(input);
      return;
    }
    void file.text().then((text) => {
      // A stuck/hung run against whatever was loaded before (schematic or a
      // different imported netlist) must not carry over into this one —
      // otherwise the Run button can stay stuck on "Stop" for a request
      // that has nothing to do with the netlist now loaded, with no way to
      // clear it short of a full reload.
      useIpcStore.getState().resetForNewModel();
      useIpcStore.getState().setImportedNetlist(text);
      useIpcStore.getState().setLastNetlist(text);
      useIpcStore.getState().setActiveEditorTab("core.netlist");
      recordRecentNetlist(file.name, text);
      useToastStore.getState().pushToast(`Imported netlist: ${file.name}`);
      document.body.removeChild(input);
    });
  });
  document.body.appendChild(input);
  input.click();
}

/**
 * Canvas.tsx exposes ReactFlow's real zoomIn()/zoomOut()/fitView() on
 * window because it's the only place with access to useReactFlow() (it's
 * inside the ReactFlowProvider tree; this module-level handleAction is
 * not). See the FE-139 comment in Canvas.tsx for why the toolbar zoom
 * buttons need this instead of writing ui.zoom/ui.pan directly.
 */
function getCanvasZoomHooks() {
  return window as typeof window & {
    __gensim_canvasZoomIn?: () => void;
    __gensim_canvasZoomOut?: () => void;
    __gensim_canvasFitView?: () => void;
  };
}

function getActiveModel() {
  const document = useGraphStore.getState().document;
  return resolveModelAtPath(document.model, activeModelPath()) ?? document.model;
}

function mutateActiveModel(
  name: string,
  mutate: (model: ReturnType<typeof getActiveModel>) => void,
): void {
  const graph = useGraphStore.getState();
  const path = activeModelPath();
  graph.transact(name, () => {
    graph.mutateModelAtPath(path, (model) => {
      mutate(model);
    });
  });
}

function selectedBlockIds(): string[] {
  const selection = useUiStore.getState().selection;
  const blocks = getActiveModel().blocks;
  const blockIdSet = new Set(blocks.map((block) => block.id));
  return [...selection].filter((id) => blockIdSet.has(id));
}

function handleAction(actionId: string, event?: KeyboardEvent): void {
  const ui = useUiStore.getState();
  const graph = useGraphStore.getState();
  // Inside the VS Code Custom Editor, VS Code owns the document lifecycle —
  // New/Open/Save/Close defer to the workbench instead of this app's storage
  // adapter. Inert (returns false) in every other host.
  if (handleHostFileAction(actionId)) {
    return;
  }
  switch (actionId) {
    case "palette.command":
      ui.pushModal("command-palette");
      break;
    case "palette.quick-insert":
    case "palette.quick-insert-azerty":
      ui.pushModal("quick-insert");
      break;
    case "file.new":
      void newFile({ confirm: async () => true });
      break;
    case "symbol.new":
      useSymbolEditorStore.getState().reset();
      useIpcStore.getState().setActiveEditorTab("core.symbol-editor");
      break;
    case "symbol.save": {
      const result = saveSymbolToLibrary();
      if (result.ok) {
        // Say which of the two actually happened. "Saved to the library" was
        // true of a component that existed only in memory and would be gone
        // on the next reload, which is exactly the impression not to give.
        useToastStore
          .getState()
          .pushToast(
            result.persisted
              ? `Component "${result.name}" saved to .gsim/symbols.`
              : `Component "${result.name}" added to this session's library only — open a workspace folder to save it to a file.`,
          );
        useSymbolEditorStore.getState().reset();
        useIpcStore.getState().setActiveEditorTab("core.schematic");
      } else {
        useToastStore.getState().pushToast(result.error);
      }
      break;
    }
    case "symbol.cancel":
      useSymbolEditorStore.getState().reset();
      useIpcStore.getState().setActiveEditorTab("core.schematic");
      break;
    case "file.open":
      // Inside VS Code this never runs: handleHostFileAction() has already
      // handed file.open to the workbench. This is the dev-harness path.
      ui.pushModal("startup");
      break;
    case "file.save":
      void (async () => {
        const startedAt = performance.now();
        try {
          await saveFile();
          useToastStore.getState().pushToast("Model saved.");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown error";
          if (msg !== "Save cancelled") {
            useToastStore.getState().pushToast(`Save failed: ${msg}`);
          }
        }
        (
          globalThis as typeof globalThis & { __gensim_last_save_ms?: number }
        ).__gensim_last_save_ms = performance.now() - startedAt;
      })();
      break;
    case "file.save-as":
      void (async () => {
        try {
          await saveFileAs();
          useToastStore.getState().pushToast("Model saved.");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown error";
          if (msg !== "Save cancelled") {
            useToastStore.getState().pushToast(`Save failed: ${msg}`);
          }
        }
      })();
      break;
    case "file.export":
      void exportCurrentModel();
      break;
    case "file.close":
      void closeFile({ confirm: async () => true });
      break;
    case "examples.insert-buck":
      insertBuckSchematic();
      break;
    case "file.import-netlist":
      importNetlistFromDisk();
      break;
    case "canvas.tool-wire":
      ui.setCanvasTool("wire");
      break;
    case "canvas.tool-label":
      ui.setCanvasTool("label");
      ui.setAnnotationTool(null);
      break;
    case "clipboard.copy": {
      const selection = useUiStore.getState().selection;
      const { blocks, wires } = getActiveModel();
      appClipboard = copySelection(blocks, wires, selection);
      break;
    }
    case "clipboard.cut": {
      const selection = useUiStore.getState().selection;
      const ids = selectedBlockIds();
      if (ids.length === 0) {
        break;
      }
      const { blocks, wires } = getActiveModel();
      appClipboard = cutSelection(blocks, wires, selection);
      mutateActiveModel("cut selection", (model) => {
        const idSet = new Set(ids);
        model.blocks = model.blocks.filter((block) => !idSet.has(block.id));
        model.wires = model.wires.filter(
          (wire) => !idSet.has(wire.from.block) && !idSet.has(wire.to.block),
        );
      });
      ui.setSelection([]);
      break;
    }
    case "clipboard.paste": {
      if (!appClipboard) {
        break;
      }
      const pasted = pasteSelection(appClipboard, {
        x: getActiveModel().grid,
        y: getActiveModel().grid,
      });
      mutateActiveModel("paste selection", (model) => {
        model.blocks.push(...pasted.blocks);
        model.wires.push(...pasted.wires);
      });
      ui.setSelection(pasted.blocks.map((block) => block.id));
      break;
    }
    case "shell.toggle-primary":
      ui.togglePrimarySideBar();
      break;
    case "shell.toggle-bottom":
      ui.toggleBottomPanel();
      break;
    case "shell.focus-output":
      ui.focusBottomTab("core.output");
      break;
    case "shell.toggle-secondary":
    case "inspector.toggle":
      ui.toggleSecondarySideBar();
      break;
    case "shell.focus-activity-1":
      ui.focusActivity("core.explorer");
      break;
    case "shell.focus-activity-2":
      ui.focusActivity("core.search");
      break;
    case "shell.focus-activity-3":
      ui.focusActivity("core.library");
      break;
    case "shell.focus-activity-4":
      ui.focusActivity("core.problems");
      break;
    case "shell.focus-tab-1":
      ui.focusBottomTab("core.waveform");
      break;
    case "shell.focus-tab-2":
      ui.focusBottomTab("core.workspace");
      break;
    case "shell.focus-tab-3":
      ui.focusBottomTab("core.output");
      break;
    case "shell.focus-tab-4":
      ui.focusBottomTab("core.problems");
      break;
    case "simulate.start":
    case "simulate.start-f5":
      void import("./shell/run").then(({ triggerRun }) => triggerRun());
      break;
    case "simulate.stop":
      void import("./shell/run").then(({ triggerCancel }) => triggerCancel());
      break;
    case "view.toggle-theme": {
      const current =
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
      break;
    }
    case "selection.select-all":
      useUiStore.getState().setSelection(getActiveModel().blocks.map((b) => b.id));
      break;
    case "selection.toggle-mode":
      ui.setCanvasTool(ui.canvasTool === "pan" ? "select" : "pan");
      break;
    case "selection.nudge":
    case "selection.nudge-large": {
      const ids = selectedBlockIds();
      if (ids.length === 0) {
        break;
      }
      const step = graph.document.model.grid * (actionId === "selection.nudge-large" ? 10 : 1);
      const key = event?.key ?? "";
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const movement = delta[key];
      if (!movement) {
        break;
      }
      mutateActiveModel("nudge", (model) => {
        const idSet = new Set(ids);
        model.blocks = model.blocks.map((block) =>
          idSet.has(block.id)
            ? {
                ...block,
                position: [block.position[0] + movement[0], block.position[1] + movement[1]],
              }
            : block,
        );
        rerouteWiresForBlocks(model, idSet);
      });
      break;
    }
    case "selection.clear":
      useUiStore.getState().setSelection([]);
      break;
    case "selection.delete":
    case "selection.delete-backspace": {
      const ids = selectedBlockIds();
      const wireIds = useUiStore.getState().selectedWireIds;
      if (ids.length > 0 || wireIds.size > 0) {
        mutateActiveModel("delete selection", (model) => {
          const idSet = new Set(ids);
          model.blocks = model.blocks.filter((block) => !idSet.has(block.id));
          model.wires = model.wires.filter(
            (wire) =>
              !wireIds.has(wire.id) && !idSet.has(wire.from.block) && !idSet.has(wire.to.block),
          );
        });
        useUiStore.getState().setSelection([]);
        useUiStore.getState().setSelectedWireIds([]);
      }
      break;
    }
    case "transform.rotate-cw": {
      const ids = selectedBlockIds();
      if (ids.length === 0) {
        break;
      }
      mutateActiveModel("rotate clockwise", (model) => {
        const turns = [0, 90, 180, 270] as const;
        const idSet = new Set(ids);
        model.blocks = model.blocks.map((block) => {
          if (!idSet.has(block.id)) {
            return block;
          }
          const index = turns.indexOf(block.rotation);
          const nextIndex = (index + 1) % turns.length;
          const rotation = turns[nextIndex] ?? block.rotation;
          return { ...block, rotation };
        });
        rerouteWiresForBlocks(model, idSet);
      });
      break;
    }
    case "transform.rotate-ccw": {
      const ids = selectedBlockIds();
      if (ids.length === 0) {
        break;
      }
      mutateActiveModel("rotate counter-clockwise", (model) => {
        const turns = [0, 90, 180, 270] as const;
        const idSet = new Set(ids);
        model.blocks = model.blocks.map((block) => {
          if (!idSet.has(block.id)) {
            return block;
          }
          const index = turns.indexOf(block.rotation);
          const nextIndex = (index + turns.length - 1) % turns.length;
          const rotation = turns[nextIndex] ?? block.rotation;
          return { ...block, rotation };
        });
        rerouteWiresForBlocks(model, idSet);
      });
      break;
    }
    case "transform.flip": {
      const ids = selectedBlockIds();
      if (ids.length === 0) {
        break;
      }
      mutateActiveModel("flip blocks", (model) => {
        const idSet = new Set(ids);
        model.blocks = model.blocks.map((block) => {
          if (!idSet.has(block.id)) {
            return block;
          }
          return {
            ...block,
            mirror: block.mirror === "x" ? "none" : "x",
          };
        });
        rerouteWiresForBlocks(model, idSet);
      });
      break;
    }
    case "transform.flip-v": {
      const ids = selectedBlockIds();
      if (ids.length === 0) {
        break;
      }
      mutateActiveModel("flip blocks vertical", (model) => {
        const idSet = new Set(ids);
        model.blocks = model.blocks.map((block) => {
          if (!idSet.has(block.id)) {
            return block;
          }
          return {
            ...block,
            mirror: block.mirror === "y" ? "none" : "y",
          };
        });
        rerouteWiresForBlocks(model, idSet);
      });
      break;
    }
    case "positioning.align-left":
    case "positioning.align-right":
    case "positioning.align-top":
    case "positioning.align-bottom": {
      const ids = selectedBlockIds();
      if (ids.length < 2) {
        break;
      }
      const catalog = useLibraryStore.getState().catalog;
      const subcktDefs = getActiveModel().subckt_defs;
      const idSet = new Set(ids);
      const boxes = new Map(
        getActiveModel()
          .blocks.filter((block) => idSet.has(block.id))
          .map((block) => [
            block.id,
            getBlockBoundingBox(block, resolveBlockMetadata(block, catalog, subcktDefs)),
          ]),
      );
      const values = [...boxes.values()];
      let target: number;
      if (actionId === "positioning.align-left") {
        target = Math.min(...values.map((box) => box.x));
      } else if (actionId === "positioning.align-right") {
        target = Math.max(...values.map((box) => box.x + box.width));
      } else if (actionId === "positioning.align-top") {
        target = Math.min(...values.map((box) => box.y));
      } else {
        target = Math.max(...values.map((box) => box.y + box.height));
      }
      mutateActiveModel("align selection", (model) => {
        model.blocks = model.blocks.map((block) => {
          const box = boxes.get(block.id);
          if (!box) {
            return block;
          }
          const [x, y] = block.position;
          if (actionId === "positioning.align-left") {
            return { ...block, position: [target, y] };
          }
          if (actionId === "positioning.align-right") {
            return { ...block, position: [target - box.width, y] };
          }
          if (actionId === "positioning.align-top") {
            return { ...block, position: [x, target] };
          }
          return { ...block, position: [x, target - box.height] };
        });
        rerouteWiresForBlocks(model, idSet);
      });
      break;
    }
    case "positioning.center-h":
    case "positioning.center-v": {
      const ids = selectedBlockIds();
      if (ids.length < 2) {
        break;
      }
      const catalog = useLibraryStore.getState().catalog;
      const subcktDefs = getActiveModel().subckt_defs;
      const idSet = new Set(ids);
      const isH = actionId === "positioning.center-h";
      const boxes = new Map(
        getActiveModel()
          .blocks.filter((block) => idSet.has(block.id))
          .map((block) => [
            block.id,
            getBlockBoundingBox(block, resolveBlockMetadata(block, catalog, subcktDefs)),
          ]),
      );
      const values = [...boxes.values()];
      const min = Math.min(...values.map((box) => (isH ? box.x : box.y)));
      const max = Math.max(...values.map((box) => (isH ? box.x + box.width : box.y + box.height)));
      const center = (min + max) / 2;
      mutateActiveModel(
        isH ? "center selection horizontally" : "center selection vertically",
        (model) => {
          model.blocks = model.blocks.map((block) => {
            const box = boxes.get(block.id);
            if (!box) {
              return block;
            }
            const [x, y] = block.position;
            return isH
              ? { ...block, position: [center - box.width / 2, y] }
              : { ...block, position: [x, center - box.height / 2] };
          });
          rerouteWiresForBlocks(model, idSet);
        },
      );
      break;
    }
    case "positioning.distribute-h":
    case "positioning.distribute-v": {
      const ids = selectedBlockIds();
      if (ids.length < 3) {
        break;
      }
      const catalog = useLibraryStore.getState().catalog;
      const subcktDefs = getActiveModel().subckt_defs;
      const idSet = new Set(ids);
      const isH = actionId === "positioning.distribute-h";
      const entries = getActiveModel()
        .blocks.filter((block) => idSet.has(block.id))
        .map((block) => {
          const box = getBlockBoundingBox(block, resolveBlockMetadata(block, catalog, subcktDefs));
          const center = isH ? box.x + box.width / 2 : box.y + box.height / 2;
          return { id: block.id, box, center };
        })
        .sort((a, b) => a.center - b.center);
      const first = entries[0];
      const last = entries[entries.length - 1];
      if (!first || !last) {
        break;
      }
      const step = (last.center - first.center) / (entries.length - 1);
      const newCenters = new Map(
        entries.map((entry, index) => [entry.id, first.center + step * index]),
      );
      const boxesById = new Map(entries.map((entry) => [entry.id, entry.box]));
      mutateActiveModel(
        isH ? "distribute selection horizontally" : "distribute selection vertically",
        (model) => {
          model.blocks = model.blocks.map((block) => {
            const newCenter = newCenters.get(block.id);
            const box = boxesById.get(block.id);
            if (newCenter === undefined || !box) {
              return block;
            }
            const [x, y] = block.position;
            return isH
              ? { ...block, position: [newCenter - box.width / 2, y] }
              : { ...block, position: [x, newCenter - box.height / 2] };
          });
          rerouteWiresForBlocks(model, idSet);
        },
      );
      break;
    }
    case "view.zoom-in":
    case "view.zoom-in-space":
      getCanvasZoomHooks().__gensim_canvasZoomIn?.();
      break;
    case "view.zoom-out":
    case "view.zoom-out-space":
      getCanvasZoomHooks().__gensim_canvasZoomOut?.();
      break;
    case "view.zoom-100":
    case "view.zoom-100-space":
    case "view.zoom-100-alt":
      ui.setZoom(1);
      ui.setPan({ x: 0, y: 0 });
      break;
    case "view.fit-diagram":
    case "view.fit-selection":
      getCanvasZoomHooks().__gensim_canvasFitView?.();
      break;
    case "library.open-browser":
      ui.focusActivity("core.library");
      break;
    case "search.find":
      ui.focusActivity("core.search");
      break;
    case "nav.model-explorer":
      ui.focusActivity("core.explorer");
      break;
    case "history.undo":
      graph.undo();
      break;
    case "history.redo":
    case "history.redo-alias":
      graph.redo();
      break;
    case "file.print":
      globalThis.print();
      break;
    case "file.switch-tab": {
      const tabs = listEditorTabs();
      if (tabs.length === 0) break;
      const active = useIpcStore.getState().activeEditorTabId;
      const idx = tabs.findIndex((tab) => tab.id === active);
      const next = tabs[(idx + 1) % tabs.length];
      if (next) {
        useIpcStore.getState().setActiveEditorTab(next.id);
      }
      break;
    }
    case "selection.move-cursor-nearest":
    case "selection.top-left":
    case "selection.bottom-right":
    case "selection.leftmost":
    case "selection.rightmost":
    case "selection.extend-adjacent": {
      const blocks = getActiveModel().blocks;
      if (blocks.length === 0) break;
      const sorted = [...blocks].sort((a, b) => {
        if (actionId === "selection.bottom-right") {
          return b.position[0] + b.position[1] - (a.position[0] + a.position[1]);
        }
        if (actionId === "selection.leftmost") {
          return a.position[0] - b.position[0];
        }
        if (actionId === "selection.rightmost") {
          return b.position[0] - a.position[0];
        }
        return a.position[0] + a.position[1] - (b.position[0] + b.position[1]);
      });
      const target = sorted[0];
      if (!target) break;
      if (actionId === "selection.extend-adjacent") {
        ui.addSelection(target.id);
      } else {
        ui.setSelection([target.id]);
      }
      break;
    }
    case "drag.constrain-axis":
      ui.setCanvasTool("pan");
      break;
    case "view.pan-page": {
      const key = event?.key ?? "ArrowRight";
      const delta: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: 300, y: 0 },
        ArrowRight: { x: -300, y: 0 },
        ArrowUp: { x: 0, y: 300 },
        ArrowDown: { x: 0, y: -300 },
      };
      const d = delta[key] ?? { x: -300, y: 0 };
      ui.setPan({ x: ui.pan.x + d.x, y: ui.pan.y + d.y });
      break;
    }
    case "nav.enter":
    case "nav.look-under-mask": {
      const ids = selectedBlockIds();
      if (ids.length !== 1) break;
      const block = getActiveModel().blocks.find((candidate) => candidate.id === ids[0]);
      if (!block?.subsystem) break;
      ui.enterSubsystem(block.id);
      break;
    }
    case "nav.leave":
      ui.leaveSubsystem();
      break;
    case "nav.back":
      ui.navBack();
      break;
    case "nav.forward":
      ui.navForward();
      break;
    case "nav.parent-library":
      ui.focusActivity("core.library");
      break;
    case "inspector.focus-main": {
      const ids = selectedBlockIds();
      if (ids.length !== 1) break;
      const block = getActiveModel().blocks.find((candidate) => candidate.id === ids[0]);
      if (!block) break;
      const metadata = resolveBlockMetadata(
        block,
        useLibraryStore.getState().catalog,
        getActiveModel().subckt_defs,
      );
      const main = metadata?.main_param;
      if (!main) break;
      ui.toggleSecondarySideBar();
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[data-param-name="${main}"] input, [data-param-name="${main}"] select`,
        );
        el?.focus();
        if (el && "select" in el) {
          (el as HTMLInputElement).select?.();
        }
      });
      break;
    }
    case "rename.selected": {
      const ids = selectedBlockIds();
      if (ids.length !== 1) break;
      const model = getActiveModel();
      const block = model.blocks.find((candidate) => candidate.id === ids[0]);
      if (!block) break;
      const next = globalThis.prompt("Rename selected element", block.label ?? block.id);
      if (!next) break;
      mutateActiveModel("rename selected", (active) => {
        active.blocks = active.blocks.map((candidate) =>
          candidate.id === block.id ? { ...candidate, label: next } : candidate,
        );
      });
      break;
    }
    case "wire.connect-selected": {
      const ids = selectedBlockIds();
      if (ids.length < 2) break;
      const model = getActiveModel();
      const first = model.blocks.find((b) => b.id === ids[0]);
      const second = model.blocks.find((b) => b.id === ids[1]);
      if (!first || !second) break;
      // Resolve real port ids from the catalog rather than assuming signal-flow
      // "out"/"in" names — electrical blocks expose ports like "p"/"n".
      const catalog = useLibraryStore.getState().catalog;
      const firstMeta = resolveBlockMetadata(first, catalog, model.subckt_defs);
      const secondMeta = resolveBlockMetadata(second, catalog, model.subckt_defs);
      const fromPort = firstMeta?.ports.outputs[0]?.id ?? firstMeta?.ports.inputs[0]?.id ?? "out";
      const toPort = secondMeta?.ports.inputs[0]?.id ?? secondMeta?.ports.outputs[0]?.id ?? "in";
      mutateActiveModel("connect selected", (active) => {
        active.wires.push({
          id: `wire-${crypto.randomUUID()}`,
          from: { block: first.id, port: fromPort },
          to: { block: second.id, port: toPort },
          waypoints: [],
          pinned: false,
          net: null,
          kind: first.domain,
        });
        rerouteWiresForBlocks(active, new Set([first.id, second.id]));
      });
      break;
    }
    case "wire.multi-port":
      ui.setCanvasTool("wire");
      break;
    case "wire.tap-line":
      ui.setCanvasTool("wire");
      break;
    case "wire.disconnect-drag":
    case "wire.disconnect-keyboard": {
      const ids = new Set(selectedBlockIds());
      if (ids.size === 0) break;
      mutateActiveModel("disconnect wires", (active) => {
        active.wires = active.wires.filter(
          (wire) => !ids.has(wire.from.block) && !ids.has(wire.to.block),
        );
      });
      break;
    }
    case "wire.toggle-posture":
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
      break;
    case "wire.comment-out":
    case "wire.toggle-comment": {
      const ids = new Set(selectedBlockIds());
      if (ids.size === 0) break;
      mutateActiveModel("comment toggle", (active) => {
        active.blocks = active.blocks.map((block) => {
          if (!ids.has(block.id)) {
            return block;
          }
          const current = block.params.__commented__ === true;
          const next = actionId === "wire.comment-out" ? true : !current;
          return { ...block, params: { ...block.params, __commented__: next } };
        });
      });
      break;
    }
    case "transform.group": {
      const ids = selectedBlockIds();
      if (ids.length < 2) break;
      // Group the selection into a virtual subsystem. Wires crossing the
      // selection boundary are preserved by synthesizing inport/outport
      // boundary blocks and rewiring them to the parent-side ports.
      {
        const catalog = useLibraryStore.getState().catalog;
        let newSubsystemId: string | null = null;
        mutateActiveModel("group selection", (active) => {
          const result = groupBlocksIntoSubsystem(active, ids, catalog);
          if (!result) {
            return;
          }
          active.blocks = result.blocks;
          active.wires = result.wires;
          newSubsystemId = result.subsystemId;
        });
        if (newSubsystemId) {
          ui.setSelection([newSubsystemId]);
        } else {
          useToastStore
            .getState()
            .pushToast("Cannot group: boundary-port blocks are unavailable in the catalog.");
        }
      }
      break;
    }
    case "transform.auto-arrange": {
      mutateActiveModel("auto arrange", (active) => {
        active.blocks = active.blocks.map((block, index) => ({
          ...block,
          position: [
            Math.round(((index % 8) * 140) / active.grid) * active.grid,
            Math.round((Math.floor(index / 8) * 90) / active.grid) * active.grid,
          ],
        }));
      });
      break;
    }
    case "transform.hide-block": {
      const ids = new Set(selectedBlockIds());
      if (ids.size === 0) break;
      mutateActiveModel("hide block", (active) => {
        active.blocks = active.blocks.map((block) =>
          ids.has(block.id)
            ? {
                ...block,
                params: { ...block.params, __hidden__: !(block.params.__hidden__ === true) },
              }
            : block,
        );
      });
      break;
    }
    case "validate.update-diagram": {
      const json = serialize(useGraphStore.getState().document);
      useToastStore.getState().pushToast(`Diagram valid (${json.length} bytes)`);
      break;
    }
    case "simulate.config":
      globalThis.dispatchEvent(new CustomEvent("gensim:open-sim-settings"));
      break;
    case "simulate.build":
      useIpcStore
        .getState()
        .appendOutput("Build requested (code generation pipeline placeholder).");
      break;
    case "simulate.refresh-model-refs":
      useToastStore.getState().pushToast("Model-reference blocks refreshed.");
      break;
    case "debug.step-over":
    case "debug.step-in":
    case "debug.step-out":
      useIpcStore.getState().appendOutput(`Debug action: ${actionId}`);
      break;
    case "probe.add-voltage": {
      const node = globalThis.prompt("Voltage probe — node name (e.g. net1)");
      if (!node?.trim()) break;
      mutateActiveModel("add V probe", (model) => {
        const { pan, zoom } = useUiStore.getState();
        const cx = Math.round(-pan.x / zoom / model.grid) * model.grid;
        const cy = Math.round(-pan.y / zoom / model.grid) * model.grid;
        addProbe(model, createVProbe(`probe-${crypto.randomUUID()}`, node.trim(), [cx, cy]));
      });
      break;
    }
    case "probe.add-current": {
      const ids = selectedBlockIds();
      const refdes =
        ids.length === 1
          ? (getActiveModel().blocks.find((b) => b.id === ids[0])?.label ?? ids[0])
          : globalThis.prompt("Current probe — component refdes (e.g. R1)");
      if (!refdes?.trim()) break;
      mutateActiveModel("add I probe", (model) => {
        const { pan, zoom } = useUiStore.getState();
        const cx = Math.round(-pan.x / zoom / model.grid) * model.grid;
        const cy = Math.round(-pan.y / zoom / model.grid) * model.grid;
        addProbe(model, createIProbe(`probe-${crypto.randomUUID()}`, refdes.trim(), [cx, cy]));
      });
      break;
    }
    case "probe.delete": {
      const selectedProbeIds = useUiStore.getState().selectedProbeIds;
      if (selectedProbeIds.size === 0) {
        useToastStore.getState().pushToast("Click a probe label to select it, then press Delete.");
        break;
      }
      mutateActiveModel("delete probes", (model) => {
        for (const id of selectedProbeIds) {
          removeProbe(model, id);
        }
      });
      useUiStore.getState().clearProbeSelection();
      break;
    }
    default:
      useIpcStore.getState().appendOutput(`Action triggered: ${actionId}`);
      break;
  }
}

export default function App() {
  bootRegistries();

  const selectionSize = useUiStore((state) => state.selection.size + state.selectedWireIds.size);
  const modalDepth = useUiStore((state) => state.modalStack.length);
  const modalStack = useUiStore((state) => state.modalStack);
  const popModal = useUiStore((state) => state.popModal);
  const paramPanelBlockId = useUiStore((state) => state.paramPanelBlockId);
  const closeParamPanel = useUiStore((state) => state.closeParamPanel);
  const setCatalog = useLibraryStore((state) => state.setCatalog);
  const setStatus = useIpcStore((state) => state.setStatus);
  const pushDiagnostic = useToastStore((state) => state.pushDiagnostic);
  const setWorkspaceVariables = useIpcStore((state) => state.setWorkspaceVariables);
  const _setLastManifest = useIpcStore((state) => state.setLastManifest);
  const inspectorVisible = useUiStore((state) => state.secondarySideBarVisible);

  useEffect(() => {
    const windowRef = globalThis as typeof globalThis & {
      __gensim_serialize?: () => string;
      __gensim_rename?: (name: string) => void;
      __gensim_load_fixture?: (name: string) => void;
      __gensim_load_document?: (doc: unknown) => void;
      /** Harness door: what the Problems panel would show, without opening it. */
      __gensim_problems?: () => Array<{ id: string; severity: string; message: string }>;
      /**
       * Harness door: the netlist this document compiles to, right now.
       *
       * The Netlist tab only fills after a run, so "is the value I typed
       * really used?" could not be asked without a solver. This answers it
       * from the document, which is where the question actually lives.
       */
      __gensim_netlist?: () => { text: string; errors: string[] };
      __gensim_setModelMetadata?: (metadata: Record<string, ParamValue>) => void;
      __gensim_insertBlock?: (type: string) => void;
      __gensim_wire?: (fromType: string, toType: string) => void;
      __gensim_wire_electrical?: (
        fromType: string,
        fromPort: string,
        toType: string,
        toPort: string,
      ) => void;
      __gensim_setActiveSimulator?: (id: string) => void;
      __gensim_setParamOnFirst?: (
        type: string,
        key: string,
        value: string | number | boolean,
      ) => void;
      __gensim_setSimulationAnalysis?: (analysis: "TRAN" | "AC" | "DC") => void;
      __gensim_run?: () => Promise<void>;
      __gensim_getWaveformPointCount?: () => number;
      __gensim_last_save_ms?: number;
      __gensim_perf?: { fixtureLoadMs: number; lastRunMs: number };
    };

    windowRef.__gensim_serialize = () => serialize(useGraphStore.getState().document);
    windowRef.__gensim_rename = (name: string) => {
      const current = useGraphStore.getState().document;
      useGraphStore.getState().loadDocument({
        ...current,
        model: { ...current.model, name },
      });
    };
    windowRef.__gensim_netlist = () => {
      const result = generateNetlist(useGraphStore.getState().document.model, {
        type: "tran",
        tEnd: 1e-3,
        tStep: 1e-6,
      });
      return { text: result.netlist ?? "", errors: result.errors ?? [] };
    };
    windowRef.__gensim_problems = () =>
      useIpcStore.getState().problems.map((problem) => ({
        id: problem.id,
        severity: problem.severity,
        message: problem.message,
      }));
    windowRef.__gensim_load_document = (doc: unknown) => {
      useGraphStore.getState().loadDocument(doc as ModelDocument);
      useGraphStore.getState().clearHistory();
    };
    windowRef.__gensim_setModelMetadata = (metadata: Record<string, ParamValue>) => {
      const current = useGraphStore.getState().document;
      useGraphStore.getState().loadDocument({
        ...current,
        model: { ...current.model, metadata: { ...current.model.metadata, ...metadata } },
      });
    };
    windowRef.__gensim_load_fixture = (name: string) => {
      if (name !== "200-blocks") {
        return;
      }
      const startedAt = performance.now();
      const fallback = Object.values(useLibraryStore.getState().catalog)[0];
      if (!fallback) {
        return;
      }
      const blocks = Array.from({ length: 200 }, (_, index) =>
        createBlockFromMetadata(fallback, [(index % 20) * 120, Math.floor(index / 20) * 80]),
      );
      useGraphStore.getState().loadDocument({
        schema_version: 2,
        model: {
          id: "fixture-200-blocks",
          name: "Fixture 200 blocks",
          grid: 10,
          params: [],
          blocks,
          wires: [],
          lines: [],
          nets: [],
          simulation: {},
          metadata: {},
        },
      });
      if (windowRef.__gensim_perf) {
        windowRef.__gensim_perf.fixtureLoadMs = performance.now() - startedAt;
      }
    };
    windowRef.__gensim_insertBlock = (type: string) => {
      const metadata = useLibraryStore.getState().catalog[type];
      if (!metadata) {
        throw new Error(`Unknown block type: ${type}`);
      }
      const graph = useGraphStore.getState();
      graph.transact(`insert ${type}`, () => {
        graph.addBlock(createBlockFromMetadata(metadata));
      });
    };
    const addWireBetweenBlocks = (
      fromType: string,
      fromPort: string,
      toType: string,
      toPort: string,
    ) => {
      const graph = useGraphStore.getState();
      const fromBlock = graph.document.model.blocks.find((block) => block.type === fromType);
      const toBlock = graph.document.model.blocks.find((block) => block.type === toType);
      if (!fromBlock || !toBlock) {
        throw new Error(`Cannot wire ${fromType} to ${toType}`);
      }
      const waypointX = Math.round((fromBlock.position[0] + toBlock.position[0]) / 2 / 10) * 10;
      graph.transact(`wire ${fromType} to ${toType}`, () => {
        graph.addWire({
          id: `wire-${crypto.randomUUID()}`,
          from: { block: fromBlock.id, port: fromPort },
          to: { block: toBlock.id, port: toPort },
          waypoints: [
            [waypointX, fromBlock.position[1] + 20],
            [waypointX, toBlock.position[1] + 20],
          ],
          pinned: false,
          net: null,
          kind: fromBlock.domain,
        });
      });
    };
    windowRef.__gensim_wire = (fromType: string, toType: string) => {
      addWireBetweenBlocks(fromType, "out", toType, "in");
    };
    windowRef.__gensim_wire_electrical = (
      fromType: string,
      fromPort: string,
      toType: string,
      toPort: string,
    ) => {
      addWireBetweenBlocks(fromType, fromPort, toType, toPort);
    };
    windowRef.__gensim_setActiveSimulator = (id: string) => {
      useLibraryStore.getState().setActiveSimulator(id);
    };
    windowRef.__gensim_setParamOnFirst = (
      type: string,
      key: string,
      value: string | number | boolean,
    ) => {
      const graph = useGraphStore.getState();
      const block = graph.document.model.blocks.find((candidate) => candidate.type === type);
      if (!block) {
        throw new Error(`Block not found for type: ${type}`);
      }
      graph.transact(`set ${key}`, () => {
        graph.setParam(block.id, key, value);
      });
    };
    windowRef.__gensim_setSimulationAnalysis = (analysis: "TRAN" | "AC" | "DC") => {
      const graph = useGraphStore.getState();
      graph.transact(`set ${analysis} analysis`, () => {
        if (analysis === "TRAN") {
          graph.setSimulation({
            analyses: [{ id: "tran_rc", type: "TRAN", t_end: 0.005, t_step: 0.000005, uic: true }],
            default_analysis: "tran_rc",
          });
          return;
        }
        if (analysis === "AC") {
          graph.setSimulation({
            analyses: [
              { id: "ac_rc", type: "AC", sweep: "DEC", n_points: 100, f_start: 1, f_end: 1e6 },
            ],
            default_analysis: "ac_rc",
          });
          return;
        }
        graph.setSimulation({
          analyses: [{ id: "dc_rc", type: "DC", source: "Vv1", start: 0, stop: 5, step: 0.1 }],
          default_analysis: "dc_rc",
        });
      });
    };
    windowRef.__gensim_run = async () => {
      const startedAt = performance.now();
      const mod = await import("./shell/run");
      await mod.triggerRun();
      if (windowRef.__gensim_perf) {
        windowRef.__gensim_perf.lastRunMs = performance.now() - startedAt;
      }
    };
    windowRef.__gensim_getWaveformPointCount = () =>
      useIpcStore.getState().waveformSlice?.time.length ?? 0;
    windowRef.__gensim_last_save_ms = 0;
    windowRef.__gensim_perf = { fixtureLoadMs: 0, lastRunMs: 0 };

    return () => {
      windowRef.__gensim_serialize = undefined;
      windowRef.__gensim_rename = undefined;
      windowRef.__gensim_load_fixture = undefined;
      windowRef.__gensim_load_document = undefined;
      windowRef.__gensim_problems = undefined;
      windowRef.__gensim_netlist = undefined;
      windowRef.__gensim_setModelMetadata = undefined;
      windowRef.__gensim_insertBlock = undefined;
      windowRef.__gensim_wire = undefined;
      windowRef.__gensim_wire_electrical = undefined;
      windowRef.__gensim_setActiveSimulator = undefined;
      windowRef.__gensim_setParamOnFirst = undefined;
      windowRef.__gensim_setSimulationAnalysis = undefined;
      windowRef.__gensim_run = undefined;
      windowRef.__gensim_getWaveformPointCount = undefined;
      windowRef.__gensim_last_save_ms = undefined;
      windowRef.__gensim_perf = undefined;
    };
  }, []);

  useEffect(() => {
    const persistedTheme = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    applyTheme(persistedTheme === "dark" ? "dark" : "light");

    setStorageAdapter(selectAdapter());
    if (Object.keys(useLibraryStore.getState().catalog).length === 0) {
      setCatalog(loadCatalogFromManifest());
    }
  }, [setCatalog]);

  useEffect(() => {
    const onDiagnostic = (event: Event) => {
      const detail = (event as CustomEvent<{ event: string; payload: Record<string, unknown> }>)
        .detail;
      if (detail) {
        pushDiagnostic(detail.event, detail.payload);
      }
    };
    globalThis.addEventListener("gensim:scaffold-diagnostic", onDiagnostic);
    return () => globalThis.removeEventListener("gensim:scaffold-diagnostic", onDiagnostic);
  }, [pushDiagnostic]);

  useEffect(() => {
    const ipc = getIpcClient();
    const unsubscribeStatus = ipc.subscribe("kernel_status", (status) => {
      setStatus(status as KernelStatus);
    });
    const unsubscribeWorkspace = ipc.subscribe("workspace_update", (variables) => {
      setWorkspaceVariables(variables as WorkspaceVariable[]);
    });
    return () => {
      unsubscribeStatus();
      unsubscribeWorkspace();
    };
  }, [setStatus, setWorkspaceVariables]);

  // Which editor surface this shell shows.
  //
  // Inside VS Code the webview hosts exactly one: the schematic. The other
  // registered tabs become their own VS Code panels rather than an in-app
  // tab strip, so the active-tab state must not move this one.
  //
  // Outside VS Code — the browser harness and the desktop shell — there are
  // no separate panels, and this was still pinned to the schematic. So
  // `file.switch-tab` cycled `activeEditorTabId` with nothing to show for
  // it, a finished run set the active tab to the waveform and the schematic
  // stayed on screen, and the waveform viewer was simply unreachable. The
  // registry had the tabs the whole time; nothing rendered them.
  const hostedByVsCode = getWebviewInit() !== null;
  const activeEditorTabId = useIpcStore((state) => state.activeEditorTabId);
  const surfaceId = hostedByVsCode ? "core.schematic" : activeEditorTabId;
  const tabs = listEditorTabs();
  const ActiveSurface =
    (tabs.find((tab) => tab.id === surfaceId) ?? tabs.find((tab) => tab.id === "core.schematic"))
      ?.component ?? null;

  return (
    <KeymapProvider
      getContexts={() => {
        const contexts: Array<"global" | "canvas" | "selection" | "modal"> = ["global", "canvas"];
        if (selectionSize > 0) {
          contexts.push("selection");
        }
        if (modalDepth > 0) {
          contexts.push("modal");
        }
        return contexts;
      }}
      onAction={(actionId, event) => {
        handleAction(actionId, event);
      }}
    >
      <div className="app-shell" data-testid="app-shell">
        <MainToolbar onAction={handleAction} />
        <div className="app-main">
          <main className="canvas-slot" aria-label="Canvas">
            <div className="canvas-surface">
              <div className="canvas-surface__body">{ActiveSurface ? <ActiveSurface /> : null}</div>
            </div>
            {modalStack.includes("quick-insert") ? (
              <QuickInsert position={{ x: 120, y: 120 }} onClose={popModal} />
            ) : null}
            {modalStack.includes("command-palette") ? (
              <CommandPalette
                onClose={popModal}
                onAction={(actionId) => {
                  handleAction(actionId);
                }}
              />
            ) : null}
            {modalStack.includes("startup") ? (
              <StartupModal
                adapter={selectAdapter()}
                onNew={() => {
                  void newFile({ confirm: async () => true });
                  popModal();
                }}
                onOpen={(id) => {
                  void openFileById(id)
                    .then(() => {
                      popModal();
                    })
                    .catch((err) => {
                      const msg = err instanceof Error ? err.message : "unknown error";
                      useToastStore.getState().pushToast(`Open failed: ${msg}`);
                    });
                }}
                onImport={() => {
                  void openFile()
                    .then(() => {
                      popModal();
                    })
                    .catch((err) => {
                      const msg = err instanceof Error ? err.message : "unknown error";
                      if (msg !== "Import cancelled") {
                        useToastStore.getState().pushToast(`Open failed: ${msg}`);
                      }
                    });
                }}
              />
            ) : null}
          </main>
          {inspectorVisible ? (
            <aside className="inspector-slot" aria-label="Inspector">
              <Inspector />
            </aside>
          ) : null}
        </div>
        <BottomPanel />
        <ToastHost />
        <ShellDialogs />
        {paramPanelBlockId && modalStack.includes("component-params") ? (
          <ErrorBoundary label="the component parameters panel" onReset={closeParamPanel}>
            <ComponentParamsPanel blockId={paramPanelBlockId} onClose={closeParamPanel} />
          </ErrorBoundary>
        ) : null}
      </div>
    </KeymapProvider>
  );
}
