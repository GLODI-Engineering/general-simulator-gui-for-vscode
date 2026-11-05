/**
 * General Simulator — VS Code extension entry point.
 *
 * Activation wires up three things:
 *
 * 1. the kernel-sidecar child process (owned by the extension host, ported
 *    from `apps/desktop/src-tauri/src/main.rs`),
 * 2. the Block Library `WebviewView` in the Activity Bar container, and
 * 3. the `*.gsim_sch` Custom Editor Provider hosting the schematic canvas,
 *
 * plus the `General Simulator: Show Waveforms` panel command.
 */
import * as vscode from "vscode";

import { GsimHost } from "./host";
import { LIBRARY_VIEW_ID, LibraryViewProvider } from "./libraryView";
import { mirrorToConsole } from "./log";
import { SCHEMATIC_VIEW_TYPE, SchematicEditorProvider } from "./schematicEditor";
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
