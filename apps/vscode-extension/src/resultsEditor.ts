/**
 * Custom Editor Provider for `*.gsim_sim_result`.
 *
 * Double-clicking a saved simulation result in the Explorer opens it in the
 * waveform viewer, plotted.
 *
 * ## Why this one is read-only, and the schematic is not
 *
 * `waveformPanel.ts` explains why *live* results are a panel rather than an
 * editor: they live in the kernel's private cache under `$XDG_DATA_HOME`,
 * keyed by an in-memory sim id, readable only while that kernel session is
 * alive. There is nothing in the Explorer to double-click, and a document
 * lifecycle would be a lie.
 *
 * A `.gsim_sim_result` is the opposite: a real file in the workspace,
 * self-contained, readable with no kernel running. It earns an editor. But
 * it is still *derived* data — the schematic and its analysis are the
 * source — so there is no edit to make here and nothing to save. The
 * provider therefore never fires `onDidChangeCustomDocument`, and VS Code
 * leaves the tab permanently clean: no phantom dirty dot, no Ctrl+S that
 * rewrites a measurement.
 *
 * Changing a result means re-running the simulation and exporting again,
 * which is the only way the file and the model it came from stay honest.
 */
import * as vscode from "vscode";

import type { GsimHost } from "./host";
import { renderWebview } from "./webview-content";

export const RESULTS_VIEW_TYPE = "generalSimulator.simResult";
export const RESULTS_EXTENSION = ".gsim_sim_result";

class ResultsDocument implements vscode.CustomDocument {
  constructor(
    readonly uri: vscode.Uri,
    public text: string,
  ) {}

  dispose(): void {
    /* no owned resources beyond the webview, which VS Code disposes */
  }
}

async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

export class ResultsEditorProvider implements vscode.CustomReadonlyEditorProvider<ResultsDocument> {
  /** Live panels per document uri, so an on-disk change can reach all of them. */
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: GsimHost,
  ) {
    // A result is usually written by something other than this editor — a
    // re-run, a script, a branch switch. Reload rather than leaving a stale
    // plot of a file that no longer says that.
    const watcher = vscode.workspace.createFileSystemWatcher(`**/*${RESULTS_EXTENSION}`);
    this.disposables.push(
      watcher,
      watcher.onDidChange((uri) => void this.reload(uri)),
    );
  }

  async openCustomDocument(uri: vscode.Uri): Promise<ResultsDocument> {
    return new ResultsDocument(uri, await readText(uri));
  }

  async resolveCustomEditor(document: ResultsDocument, panel: vscode.WebviewPanel): Promise<void> {
    const key = document.uri.toString();
    const set = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    set.add(panel);
    this.panels.set(key, set);

    const registration = this.host.register("results", panel.webview);
    panel.onDidDispose(() => {
      registration.dispose();
      set.delete(panel);
      if (set.size === 0) this.panels.delete(key);
    });

    panel.webview.onDidReceiveMessage((message: unknown) => {
      this.host.handleCommonMessage(panel.webview, message);
    });

    await renderWebview(
      this.extensionUri,
      panel.webview,
      {
        role: "results",
        documentUri: document.uri.toString(),
        documentText: document.text,
        // No kernel: the file is the whole result. Handing the webview a
        // kernel config here would invite it to go and fetch signals that
        // are already in its hands, keyed by a sim id from another session.
      },
      this.host.log,
    );
  }

  private async reload(uri: vscode.Uri): Promise<void> {
    const open = this.panels.get(uri.toString());
    if (!open || open.size === 0) return;
    let text: string;
    try {
      text = await readText(uri);
    } catch {
      // Deleted or momentarily unreadable mid-write — keep showing what we
      // have rather than blanking the chart.
      return;
    }
    for (const panel of open) {
      await panel.webview.postMessage({ type: "gsim/setDocument", text });
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.panels.clear();
  }
}
