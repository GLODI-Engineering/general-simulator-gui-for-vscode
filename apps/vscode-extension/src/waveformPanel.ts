/**
 * Waveform / results viewer.
 *
 * ## Why a panel and not a second Custom Editor
 *
 * The task suggested registering a second `CustomEditorProvider` for a results
 * file. Investigation of the actual pipeline says otherwise:
 *
 * - `packages/simulator/src/simulator/postprocess/result_writer.py` *does*
 *   persist results, but as a **directory**: `<workdir>/results/<sim_id>/`
 *   containing `manifest.json`, `time.npy` and `signals/<block>__<port>.npy`.
 * - `apps/kernel-sidecar/.../server.py` puts that `workdir` under
 *   `$XDG_DATA_HOME/general-simulator/sidecar-workdir` (or
 *   `~/.local/share/...`) — an app-private cache **outside the user's
 *   workspace**, so it never appears in the Explorer to be double-clicked.
 * - The frontend never reads those files directly: `ipc/client.ts`'s
 *   `waveformGet(simId, signals)` fetches
 *   `http://127.0.0.1:<port>/results/<simId>/manifest.json?token=…` from the
 *   **running** sidecar's token-gated slice server, keyed by an in-memory
 *   `sim_id`.
 * - There is no single-file extension to register on; the only filename is the
 *   generic `manifest.json`, and claiming a glob over every manifest.json would hijack
 *   unrelated files in the user's workspace.
 *
 * A file-backed custom editor would therefore advertise a document lifecycle
 * (dirty / save / revert) that does not exist for read-only derived data that
 * is only readable while a specific kernel session is alive. So: a singleton
 * webview panel, opened by `General Simulator: Show Waveforms`, attached to
 * whichever schematic editor last finished a simulation.
 *
 * If a persisted single-file results bundle (a `.gsim_wave` export) is ever
 * added, registering a second Custom Editor for *that* becomes the right call —
 * it would reuse the same `waveform/WaveformTab` surface this panel hosts.
 */
import * as vscode from "vscode";

import type { GsimHost } from "./host";
import { renderWebview } from "./webview-content";

const PANEL_VIEW_TYPE = "generalSimulator.waveforms";

export class WaveformPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private registration: vscode.Disposable | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: GsimHost,
  ) {}

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      if (this.host.lastSimId) {
        await this.panel.webview.postMessage({
          type: "gsim/showSimulation",
          simId: this.host.lastSimId,
        });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      "Waveforms",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel = panel;
    this.registration = this.host.register("waveform", panel.webview);

    panel.webview.onDidReceiveMessage((message) => {
      this.host.handleCommonMessage(panel.webview, message);
    });

    panel.onDidDispose(() => {
      this.registration?.dispose();
      this.registration = null;
      this.panel = null;
    });

    await renderWebview(
      this.extensionUri,
      panel.webview,
      {
        role: "waveform",
        kernel: this.host.kernel.current ?? undefined,
      },
      this.host.log,
    );
  }

  dispose(): void {
    this.registration?.dispose();
    this.panel?.dispose();
  }
}
