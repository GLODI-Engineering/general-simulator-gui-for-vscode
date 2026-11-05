/**
 * Shared extension-host state: the kernel sidecar, the live webview registry,
 * and the cross-webview drag broker.
 *
 * ## Why a broker at all
 *
 * In the standalone app the block library and the schematic canvas share one
 * DOM, so `canvas/dnd.ts` could keep the dragged block in a module variable.
 * Under VS Code they are two *isolated webview iframes* (a `WebviewView` in the
 * Activity Bar and a `WebviewPanel` owned by the custom editor).
 *
 * VS Code has no webview drop-MIME API — `dropMimeTypes`/`dragMimeTypes` exist
 * only on `TreeDragAndDropController` (tree views) and `DocumentDropEditProvider`
 * (text editors); `WebviewOptions` has no such field in any shipped version of
 * `@types/vscode` (checked against 1.136). What *does* work is that Chromium
 * still routes the native drag's `dragover`/`drop` events to whichever iframe
 * the cursor is over — but `dataTransfer.getData()` for a custom MIME type is
 * not readable across that origin boundary.
 *
 * So the drag is split: the **native drag carries the pointer**, and the
 * **extension host carries the payload**. The library webview posts
 * `gsim/dragStart` on `dragstart`; the host broadcasts `gsim/dragState` to
 * every other webview; the schematic webview's drop handler falls back to that
 * value when `getData()` comes back empty (see `resolveDroppedBlock`).
 */
import * as vscode from "vscode";

import { KernelSidecar } from "./kernel";
import {
  SYMBOLS_DIR,
  SymbolLibraryError,
  loadSymbols,
  saveSymbol,
  symbolWorkspace,
} from "./symbolLibrary";
import {
  type HostBoundMessage,
  type WebviewBoundMessage,
  type WebviewRole,
  isHostBoundMessage,
} from "./protocol";

interface RegisteredWebview {
  role: WebviewRole;
  webview: vscode.Webview;
}

export class GsimHost implements vscode.Disposable {
  readonly kernel: KernelSidecar;
  private readonly webviews = new Set<RegisteredWebview>();
  private readonly disposables: vscode.Disposable[] = [];

  /** sim id of the most recent finished simulation, for the waveform panel. */
  lastSimId: string | null = null;

  private readonly onShowWaveformsEmitter = new vscode.EventEmitter<void>();
  readonly onShowWaveforms = this.onShowWaveformsEmitter.event;

  /** Roles whose webview has reported `gsim/ready` (i.e. React actually mounted). */
  readonly readyRoles = new Set<WebviewRole>();

  private readonly onDidWebviewReadyEmitter = new vscode.EventEmitter<WebviewRole>();
  readonly onDidWebviewReady = this.onDidWebviewReadyEmitter.event;

  /** Every inbound webview message, for the integration harness to observe. */
  private readonly onDidReceiveEmitter = new vscode.EventEmitter<{
    role: WebviewRole;
    message: HostBoundMessage;
  }>();
  readonly onDidReceive = this.onDidReceiveEmitter.event;

  constructor(readonly log: vscode.OutputChannel) {
    this.kernel = new KernelSidecar(log);
    this.disposables.push(
      this.kernel,
      this.onShowWaveformsEmitter,
      this.onDidWebviewReadyEmitter,
      this.onDidReceiveEmitter,
      this.kernel.onDidChange((config) => {
        this.broadcast(
          config ? { type: "gsim/kernelConfig", kernel: config } : { type: "gsim/kernelStopped" },
        );
      }),
    );
  }

  register(role: WebviewRole, webview: vscode.Webview): vscode.Disposable {
    const entry: RegisteredWebview = { role, webview };
    this.webviews.add(entry);
    return new vscode.Disposable(() => {
      this.webviews.delete(entry);
      this.readyRoles.delete(role);
    });
  }

  /** First live webview for a role, if any. */
  webviewFor(role: WebviewRole): vscode.Webview | null {
    for (const entry of this.webviews) {
      if (entry.role === role) {
        return entry.webview;
      }
    }
    return null;
  }

  broadcast(
    message: WebviewBoundMessage,
    options: { exclude?: vscode.Webview; role?: WebviewRole } = {},
  ): void {
    for (const entry of this.webviews) {
      if (options.exclude && entry.webview === options.exclude) continue;
      if (options.role && entry.role !== options.role) continue;
      void entry.webview.postMessage(message);
    }
  }

  /**
   * Handles the messages that are the same for every surface. Returns true if
   * the message was consumed, so callers can fall through to their own
   * surface-specific handling (document lifecycle, etc.).
   */
  /**
   * Write an authored component to the workspace and tell every webview.
   *
   * The catalog merge in the authoring webview is optimistic — the component
   * appears in the library immediately — so this reports only the outcome,
   * and a failure has to be visible or the user believes a component is saved
   * that is not.
   */
  private async persistSymbol(name: string, metadata: unknown): Promise<void> {
    const workspace = symbolWorkspace();
    if (!workspace) {
      const reason =
        "no workspace folder is open, so there is nowhere to save it. " +
        "Open the folder your design lives in and save again.";
      this.log.appendLine(`[symbols] refused to save ${name}: ${reason}`);
      this.broadcast({ type: "gsim/symbolSaveFailed", name, reason });
      void vscode.window.showErrorMessage(`Could not save component "${name}": ${reason}`);
      return;
    }

    try {
      const file = await saveSymbol(workspace, name, metadata);
      this.log.appendLine(`[symbols] saved ${name} -> ${file.fsPath}`);
      this.broadcast({ type: "gsim/symbolSaved", name, path: file.fsPath });
      await this.publishSymbols();
    } catch (error) {
      const reason =
        error instanceof SymbolLibraryError || error instanceof Error
          ? error.message
          : String(error);
      this.log.appendLine(`[symbols] failed to save ${name}: ${reason}`);
      this.broadcast({ type: "gsim/symbolSaveFailed", name, reason });
      void vscode.window.showErrorMessage(`Could not save component "${name}": ${reason}`);
    }
  }

  /** Read the workspace's components and push them to every webview. */
  async publishSymbols(): Promise<void> {
    const symbols = await this.readSymbols();
    this.broadcast({ type: "gsim/userSymbols", metadata: symbols });
  }

  /**
   * Components currently on disk. Also used to seed a webview's init payload,
   * so the library has them before React mounts instead of popping in after.
   */
  async readSymbols(): Promise<unknown[]> {
    const workspace = symbolWorkspace();
    if (!workspace) {
      return [];
    }
    const { metadata, failures } = await loadSymbols(workspace);
    for (const failure of failures) {
      // Reported, never silently skipped: a component that vanishes with no
      // explanation is worse than one that is visibly broken.
      this.log.appendLine(
        `[symbols] ignoring ${SYMBOLS_DIR}/${failure.file}: ${failure.reason}`,
      );
    }
    if (failures.length > 0) {
      void vscode.window.showWarningMessage(
        `${failures.length} component file(s) in ${SYMBOLS_DIR} could not be read. ` +
          "See General Simulator: Show Kernel Log.",
      );
    }
    return metadata;
  }

  handleCommonMessage(source: vscode.Webview, raw: unknown): boolean {
    if (!isHostBoundMessage(raw)) {
      return false;
    }
    const message = raw as HostBoundMessage;

    const sourceRole = this.roleOf(source);
    if (sourceRole) {
      this.onDidReceiveEmitter.fire({ role: sourceRole, message });
    }

    switch (message.type) {
      case "gsim/restartKernel":
        void this.kernel.restart();
        return true;

      // --- user-authored components --------------------------------------
      case "gsim/saveSymbol":
        void this.persistSymbol(message.name, message.metadata);
        return true;

      // --- in-app File buttons -> the workbench's own commands -----------
      // The webview's toolbar defers here instead of driving its own storage
      // adapter, because inside a Custom Editor VS Code owns the document
      // lifecycle. Dirty state is already live (every graph mutation posts
      // gsim/documentChanged, which fires onDidChangeCustomDocument), so
      // "Save" only has to trigger the same save the tab's own affordance
      // would. These target the *active* editor: the click that produced the
      // message necessarily came from the focused webview, and only the
      // schematic surface renders the File toolbar at all.
      case "gsim/newSchematic":
        void vscode.commands.executeCommand("generalSimulator.newSchematic");
        return true;
      case "gsim/openSchematic":
        void vscode.commands.executeCommand("generalSimulator.openSchematic");
        return true;
      case "gsim/saveDocument":
        void vscode.commands.executeCommand(
          message.as ? "workbench.action.files.saveAs" : "workbench.action.files.save",
        );
        return true;
      case "gsim/closeDocument":
        void vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        return true;

      // --- cross-webview drag bridge -------------------------------------
      case "gsim/dragStart":
        this.broadcast(
          { type: "gsim/dragState", blockName: message.blockName, label: message.label },
          { exclude: source },
        );
        return true;
      case "gsim/dragEnd":
        this.broadcast({ type: "gsim/dragState", blockName: null }, { exclude: source });
        return true;

      // --- click-to-insert from the library sidebar ----------------------
      case "gsim/insertBlock":
        this.broadcast(
          { type: "gsim/insertBlock", blockName: message.blockName },
          { exclude: source, role: "schematic" },
        );
        return true;

      case "gsim/simulationFinished":
        this.lastSimId = message.simId;
        this.broadcast({ type: "gsim/showSimulation", simId: message.simId }, { role: "waveform" });
        return true;

      case "gsim/showWaveforms":
        this.onShowWaveformsEmitter.fire();
        return true;

      case "gsim/log":
        this.log.appendLine(`[webview:${message.level}] ${message.message}`);
        return true;

      case "gsim/ready":
        this.readyRoles.add(message.role);
        this.onDidWebviewReadyEmitter.fire(message.role);
        // Late-arriving webviews need the current kernel config immediately.
        if (this.kernel.current) {
          void source.postMessage({ type: "gsim/kernelConfig", kernel: this.kernel.current });
        }
        if (message.role === "waveform" && this.lastSimId) {
          void source.postMessage({ type: "gsim/showSimulation", simId: this.lastSimId });
        }
        return true;

      // Replies to integration probes are consumed by whoever awaits them via
      // onDidReceive; nothing in the product reacts to them.
      case "gsim/test/report":
        return true;

      default:
        return false;
    }
  }

  private roleOf(webview: vscode.Webview): WebviewRole | null {
    for (const entry of this.webviews) {
      if (entry.webview === webview) {
        return entry.role;
      }
    }
    return null;
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.webviews.clear();
  }
}
