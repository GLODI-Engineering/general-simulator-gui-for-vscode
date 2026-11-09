/**
 * General Simulator — VS Code extension entry point.
 *
 * Activation wires up three things:
 *
 * 1. the kernel-sidecar child process (owned by the extension host, ported
 *    from `apps/desktop/src-tauri/src/main.rs`),
 * 2. the Block Library `WebviewView` in the Activity Bar container, and
 * 3. the `*.gsim_sch` Custom Editor Provider hosting the schematic canvas,
 *    and the read-only `*.gsim_sim_result` one hosting the waveform viewer,
 *
 * plus the `General Simulator: Show Waveforms` panel command.
 */
import * as vscode from "vscode";

import { GsimHost } from "./host";
import { LIBRARY_VIEW_ID, LibraryViewProvider } from "./libraryView";
import { mirrorToConsole } from "./log";
import { RESULTS_VIEW_TYPE, ResultsEditorProvider } from "./resultsEditor";
import { SCHEMATIC_VIEW_TYPE, SchematicEditorProvider } from "./schematicEditor";
import { symbolWatchPattern } from "./symbolLibrary";
import { type GsimTestApi, createTestApi } from "./test-api";
import { isIntegrationTest } from "./test-mode";
import { WaveformPanel } from "./waveformPanel";

export async function activate(context: vscode.ExtensionContext): Promise<GsimTestApi | undefined> {
  const channel = vscode.window.createOutputChannel("General Simulator");
  context.subscriptions.push(channel);
  const log = mirrorToConsole(channel);

  const host = new GsimHost(log);
  context.subscriptions.push(host);

  const waveforms = new WaveformPanel(context.extensionUri, host);
  context.subscriptions.push(waveforms);
  context.subscriptions.push(host.onShowWaveforms(() => void waveforms.show()));

  // User components are files, so they can change without going through the
  // editor: a script writes one, a colleague's branch adds one, the user
  // edits the JSON by hand. Watch the folder and re-publish, rather than
  // treating the running catalog as the source of truth.
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const watcher = vscode.workspace.createFileSystemWatcher(symbolWatchPattern(folder));
    const republish = () => void host.publishSymbols();
    context.subscriptions.push(
      watcher,
      watcher.onDidCreate(republish),
      watcher.onDidChange(republish),
      watcher.onDidDelete(republish),
    );
  }

  const schematicProvider = new SchematicEditorProvider(context.extensionUri, host);
  context.subscriptions.push(schematicProvider);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(SCHEMATIC_VIEW_TYPE, schematicProvider, {
      // The canvas holds a lot of live state; rebuilding it on every tab
      // switch would be visibly slow.
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  const resultsProvider = new ResultsEditorProvider(context.extensionUri, host);
  context.subscriptions.push(resultsProvider);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(RESULTS_VIEW_TYPE, resultsProvider, {
      // A result holds every sample of every signal; re-decoding and
      // re-plotting them on each tab switch is visibly slow.
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LIBRARY_VIEW_ID,
      new LibraryViewProvider(context.extensionUri, host),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("generalSimulator.showWaveforms", () => waveforms.show()),
    vscode.commands.registerCommand("generalSimulator.restartKernel", async () => {
      const config = await host.kernel.restart();
      if (config) {
        void vscode.window.showInformationMessage(
          `General Simulator: kernel restarted on port ${config.port}.`,
        );
      } else {
        void vscode.window.showErrorMessage(
          "General Simulator: kernel failed to start — see the General Simulator output channel.",
        );
      }
    }),
    vscode.commands.registerCommand("generalSimulator.showKernelLog", () => log.show()),
    /**
     * Hand a keyboard shortcut VS Code claimed to the schematic.
     *
     * A webview only receives a keystroke the workbench did not take first, so the 28 chords
     * VS Code binds at the workbench level never reached the canvas — `Ctrl+R` opened its
     * recent-files list rather than rotating the selection. `package.json` contributes those
     * chords, generated from the schematic's own keymap by `scripts/gen-keybindings.mjs`, each
     * guarded by `activeCustomEditorId` and the `overrideVsCodeKeybindings` setting. This
     * relays the chord in.
     *
     * Broadcast to the schematic role rather than to one webview: the keybinding only fires
     * with a schematic active, and the webview synthesises a real keydown, so a background
     * schematic tab drops it at the same focus check a physical keystroke would meet.
     */
    vscode.commands.registerCommand("generalSimulator.forwardChord", (args: unknown) => {
      const chord =
        args && typeof args === "object" && typeof (args as { chord?: unknown }).chord === "string"
          ? (args as { chord: string }).chord
          : null;
      if (!chord) {
        // Reachable only from the command palette or a hand-written keybinding with no `args`.
        // There is no chord to forward, and guessing one would fire an arbitrary action.
        log.appendLine("forwardChord: ignored, no chord in args");
        return;
      }
      host.broadcast({ type: "gsim/forwardedChord", chord }, { role: "schematic" });
    }),
    vscode.commands.registerCommand("generalSimulator.newSchematic", async () => {
      const target = await vscode.window.showSaveDialog({
        filters: { "General Simulator schematic": ["gsim_sch"] },
        saveLabel: "Create schematic",
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(""));
      await vscode.commands.executeCommand("vscode.openWith", target, SCHEMATIC_VIEW_TYPE);
    }),
    vscode.commands.registerCommand("generalSimulator.openSchematic", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { "General Simulator schematic": ["gsim_sch"] },
        openLabel: "Open schematic",
      });
      const target = picked?.[0];
      if (!target) return;
      await vscode.commands.executeCommand("vscode.openWith", target, SCHEMATIC_VIEW_TYPE);
    }),
  );

  const autoStart = vscode.workspace
    .getConfiguration("generalSimulator")
    .get<boolean>("autoStartKernel", true);
  if (autoStart) {
    void host.kernel.start();
  }

  // Only the @vscode/test-electron harness gets a handle on the live host.
  return isIntegrationTest() ? createTestApi(host) : undefined;
}

export function deactivate(): void {
  // Everything is registered in `context.subscriptions`; VS Code disposes it,
  // and `GsimHost.dispose()` tears the kernel sidecar down.
}
