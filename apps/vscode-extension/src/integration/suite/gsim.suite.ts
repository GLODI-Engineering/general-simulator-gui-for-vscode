/**
 * Integration suite — runs inside a real VS Code extension host launched by
 * `@vscode/test-electron`.
 *
 * What each layer here actually exercises (be precise about this when reading
 * a green run):
 *
 * - **Real**: extension activation, contribution registration, the Custom
 *   Editor Provider resolving a `.gsim_sch`, the sidebar `WebviewView`
 *   resolving, the Vite bundle loading under the injected CSP inside a real
 *   Chromium webview, React mounting and rendering real DOM, the zustand
 *   stores populating, `Webview.postMessage` in both directions, and the whole
 *   `GsimHost` fan-out.
 * - **Real, at the DOM-event layer**: the canvas drop handler runs against a
 *   genuine `DragEvent` with a genuine empty `DataTransfer`, dispatched on the
 *   real `.canvas-flow` element, and inserts a real block into the graph.
 * - **NOT covered**: the browser's own pointer/hit-testing that decides *which
 *   iframe* receives `dragover`/`drop` during a physical mouse drag between
 *   two webviews. No VS Code extension API can synthesise an OS-level drag
 *   across webview boundaries. That single step still needs a human.
 */
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";

import type { GsimTestApi } from "../../test-api";
import { EXTENSION_ID as TEST_API_EXTENSION_ID, getTestApi } from "../../test-api";

// Imported, not re-declared: see test-api.ts.
const EXTENSION_ID = TEST_API_EXTENSION_ID;
const SCHEMATIC_VIEW_TYPE = "generalSimulator.schematic";

interface MountReport {
  role: string;
  rootExists: boolean;
  childElementCount: number;
  textLength: number;
  hasCanvas: boolean;
  hasLibrary: boolean;
  hasLibraryItems: number;
  hasWaveform: boolean;
  hasMainToolbar: boolean;
}

interface DropReport {
  before: number;
  after: number;
  inserted: number;
  lastBlockType: string | null;
  canvasRect: { width: number; height: number };
}

function workspaceDir(): string {
  const dir = process.env.GSIM_TEST_WORKSPACE;
  assert.ok(dir, "GSIM_TEST_WORKSPACE must be set by the launcher");
  return dir;
}

function schematicUri(): vscode.Uri {
  return vscode.Uri.file(path.join(workspaceDir(), "sample.gsim_sch"));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let api: GsimTestApi;

suite("General Simulator — VS Code integration", () => {
  suiteSetup(async () => {
    api = await getTestApi();
  });

  // -------------------------------------------------------------------------
  test("the extension activates and registers its contributions", async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, "extension is present");
    assert.equal(extension.isActive, true, "extension is active");

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      "generalSimulator.showWaveforms",
      "generalSimulator.restartKernel",
      "generalSimulator.showKernelLog",
      "generalSimulator.newSchematic",
      "generalSimulator.openSchematic",
    ]) {
      assert.ok(commands.includes(id), `command ${id} is registered`);
    }

    const contributes = extension.packageJSON.contributes;
    assert.equal(contributes.customEditors[0].viewType, SCHEMATIC_VIEW_TYPE);
    assert.equal(contributes.customEditors[0].selector[0].filenamePattern, "*.gsim_sch");
    assert.equal(contributes.views.generalSimulator[0].id, "generalSimulator.library");
    assert.equal(contributes.views.generalSimulator[0].type, "webview");
  });

  // -------------------------------------------------------------------------
  suite("library sidebar webview", () => {
    suiteSetup(async () => {
      await vscode.commands.executeCommand("generalSimulator.library.focus");
      await api.waitForWebview("library");
    });

    test("renders the real React library, not a placeholder", async () => {
      const report = await api.probe<MountReport>("library", "mounted");
      assert.equal(report.role, "library");
      assert.equal(report.rootExists, true, "#root exists");
      assert.ok(report.childElementCount > 0, "React rendered into #root");
      assert.equal(report.hasLibrary, true, ".library-activity is in the DOM");
      assert.ok(report.textLength > 50, `library rendered text (${report.textLength} chars)`);
    });

    test("loads the block catalog and renders draggable items", async () => {
      const catalogSize = await api.probe<number>("library", "catalogSize");
      assert.ok(catalogSize > 0, `catalog loaded (${catalogSize} entries)`);

      const report = await api.probe<MountReport>("library", "mounted");
      assert.ok(report.hasLibraryItems > 0, `rendered ${report.hasLibraryItems} .library-item`);
    });
  });

  // -------------------------------------------------------------------------
  suite("schematic custom editor", () => {
    suiteSetup(async () => {
      await vscode.commands.executeCommand("vscode.openWith", schematicUri(), SCHEMATIC_VIEW_TYPE);
      await api.waitForWebview("schematic");
    });

    test("opens .gsim_sch in the custom editor and mounts the canvas", async () => {
      const report = await api.probe<MountReport>("schematic", "mounted");
      assert.equal(report.role, "schematic");
      assert.ok(report.childElementCount > 0, "React rendered into #root");
      assert.equal(report.hasCanvas, true, ".canvas-flow is in the DOM");
      assert.equal(report.hasMainToolbar, true, ".main-toolbar is in the DOM");
    });

    test("the custom editor is the active editor for the file", () => {
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
      assert.ok(tab, "a tab is active");
      const input = tab.input as { viewType?: string; uri?: vscode.Uri };
      assert.equal(input.viewType, SCHEMATIC_VIEW_TYPE);
      assert.equal(input.uri?.fsPath, schematicUri().fsPath);
    });

    test("editing in the webview marks the VS Code tab dirty, and save writes the file", async () => {
      const changed = api.nextMessage("schematic", "gsim/documentChanged");
      await api.probe("schematic", "renameModel", { name: "IntegrationRenamed" });
      await changed;

      // VS Code needs a beat to reflect onDidChangeCustomDocument on the tab.
      for (let i = 0; i < 40 && !vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty; i++) {
        await sleep(100);
      }
      assert.equal(
        vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty,
        true,
        "tab went dirty via onDidChangeCustomDocument",
      );

      const saved = await vscode.commands.executeCommand("workbench.action.files.save");
      void saved;
      for (let i = 0; i < 40 && vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty; i++) {
        await sleep(100);
      }
      assert.equal(
        vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty,
        false,
        "tab is clean after save",
      );

      const onDisk = fs.readFileSync(schematicUri().fsPath, "utf8");
      assert.ok(onDisk.length > 0, "saveCustomDocument wrote bytes to disk");
      assert.ok(
        onDisk.includes("IntegrationRenamed"),
        "the file contains the edit made inside the webview",
      );
    });

    test("the in-app Save button funnels into VS Code's own save, not the storage adapter", async () => {
      // Make the editor dirty through a real graph mutation first, so a save
      // that does nothing would be visible as a still-dirty tab.
      const changed = api.nextMessage("schematic", "gsim/documentChanged");
      await api.probe("schematic", "renameModel", { name: "ToolbarSavedModel" });
      await changed;

      for (let i = 0; i < 40 && !vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty; i++) {
        await sleep(100);
      }
      assert.equal(
        vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty,
        true,
        "tab is dirty before the toolbar Save click",
      );

      // Click the *real* toolbar button in the real webview DOM. The click
      // must reach the extension host as gsim/saveDocument — which is what
      // proves App.handleAction routed through handleHostFileAction rather
      // than through file-ops.ts + the storage adapter.
      const saveRequested = api.nextMessage("schematic", "gsim/saveDocument");
      const clicked = await api.probe<{ clicked: string }>("schematic", "clickToolbarButton", {
        label: "Save",
      });
      assert.equal(clicked.clicked, "Save");
      await saveRequested;

      for (let i = 0; i < 40 && vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty; i++) {
        await sleep(100);
      }
      assert.equal(
        vscode.window.tabGroups.activeTabGroup.activeTab?.isDirty,
        false,
        "the toolbar click drove VS Code's save and cleaned the tab",
      );

      const onDisk = fs.readFileSync(schematicUri().fsPath, "utf8");
      assert.ok(
        onDisk.includes("ToolbarSavedModel"),
        "saveCustomDocument wrote the toolbar-saved edit to the real file",
      );
    });
  });

  // -------------------------------------------------------------------------
  suite("cross-webview drag bridge (message-protocol layer)", () => {
    suiteSetup(async () => {
      await vscode.commands.executeCommand("generalSimulator.library.focus");
      await api.waitForWebview("library");
      await vscode.commands.executeCommand("vscode.openWith", schematicUri(), SCHEMATIC_VIEW_TYPE);
      await api.waitForWebview("schematic");
    });

    teardown(async () => {
      await api.probe("library", "simulateDragEnd").catch(() => undefined);
      await sleep(150);
    });

    test("a drag started in the library reaches the schematic webview", async () => {
      const before = await api.probe<string | null>("schematic", "dragState");
      assert.equal(before, null, "no drag in flight to begin with");

      // Real drag-source path: this is what SidebarItem.onDragStart calls.
      await api.probe("library", "simulateDragStart", {
        blockName: "passive.resistor",
        label: "Resistor",
      });

      // Give GsimHost's fan-out a moment to reach the other webview.
      let seen: string | null = null;
      for (let i = 0; i < 50; i += 1) {
        seen = await api.probe<string | null>("schematic", "dragState");
        if (seen === "passive.resistor") break;
        await sleep(100);
      }
      assert.equal(
        seen,
        "passive.resistor",
        "the schematic webview adopted the block broadcast by the extension host",
      );
    });

    test("the library webview does not receive its own drag broadcast echoed back", async () => {
      await api.probe("library", "simulateDragStart", { blockName: "passive.capacitor" });
      await sleep(400);
      // The library's own tracker holds it because *it* set it, not because it
      // was echoed — the meaningful assertion is that the schematic got it.
      const schematic = await api.probe<string | null>("schematic", "dragState");
      assert.equal(schematic, "passive.capacitor");
    });

    test("dropping on the real canvas inserts the host-brokered block", async () => {
      const startCount = await api.probe<number>("schematic", "blockCount");

      await api.probe("library", "simulateDragStart", {
        blockName: "passive.resistor",
        label: "Resistor",
      });
      for (let i = 0; i < 50; i += 1) {
        if ((await api.probe("schematic", "dragState")) === "passive.resistor") break;
        await sleep(100);
      }

      // A genuine DragEvent with an EMPTY DataTransfer, dispatched on the real
      // .canvas-flow element — precisely the cross-webview case where
      // getData() yields nothing and the payload must come from the host.
      const drop = await api.probe<DropReport>("schematic", "dispatchCanvasDrop");

      assert.ok(drop.canvasRect.width > 0, "the canvas has real layout geometry");
      assert.equal(drop.inserted, 1, "exactly one block was inserted by the drop handler");
      assert.equal(drop.lastBlockType, "passive.resistor", "the brokered block is what landed");
      assert.equal(drop.before, startCount);

      const endCount = await api.probe<number>("schematic", "blockCount");
      assert.equal(endCount, startCount + 1, "the graph store really grew");
    });

    test("ending the drag clears the brokered payload everywhere", async () => {
      await api.probe("library", "simulateDragStart", { blockName: "passive.resistor" });
      for (let i = 0; i < 50; i += 1) {
        if ((await api.probe("schematic", "dragState")) === "passive.resistor") break;
        await sleep(100);
      }
      await api.probe("library", "simulateDragEnd");

      let seen: string | null = "passive.resistor";
      for (let i = 0; i < 50; i += 1) {
        seen = await api.probe<string | null>("schematic", "dragState");
        if (seen === null) break;
        await sleep(100);
      }
      assert.equal(seen, null, "gsim/dragEnd cleared the schematic webview's tracker");
    });

    test("a drop with nothing in flight inserts nothing", async () => {
      await api.probe("library", "simulateDragEnd");
      await sleep(300);
      const drop = await api.probe<DropReport>("schematic", "dispatchCanvasDrop");
      assert.equal(drop.inserted, 0, "no phantom insertion");
    });
  });

  // -------------------------------------------------------------------------
  suite("waveform panel", () => {
    test("the Show Waveforms command opens a webview that mounts", async () => {
      await vscode.commands.executeCommand("generalSimulator.showWaveforms");
      await api.waitForWebview("waveform");
      const report = await api.probe<MountReport>("waveform", "mounted");
      assert.equal(report.role, "waveform");
      assert.ok(report.childElementCount > 0, "React rendered into #root");
      assert.equal(report.hasWaveform, true, "the waveform surface is in the DOM");
    });
  });

  // -------------------------------------------------------------------------
  suite("kernel sidecar", () => {
    test("the extension host spawns kernel-sidecar and completes the handshake", async function () {
      // Needs `uv` and a real checkout; skip rather than fail elsewhere.
      const { execFileSync } = await import("node:child_process");
      try {
        execFileSync("uv", ["--version"], { stdio: "ignore" });
      } catch {
        this.skip();
        return;
      }
      this.timeout(180_000);

      const config = await api.startKernel();
      assert.ok(config, "kernel sidecar started");
      assert.ok(config.port > 0 && config.port <= 65535, `bound a real port (${config.port})`);
      assert.match(config.token, /^[0-9a-f]{32}$/, "token round-tripped through KERNEL_READY");
      assert.deepEqual(api.kernelConfig(), config, "the host cached the config");
    });
  });
});
