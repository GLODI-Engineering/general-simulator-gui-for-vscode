/**
 * The block library, contributed as a `type: "webview"` view inside the
 * General Simulator Activity Bar view container.
 *
 * This is the real VS Code contribution point ("the left panel extensions use
 * to display their things") replacing the removed `shell/PrimarySideBar`.
 */
import type * as vscode from "vscode";

import type { GsimHost } from "./host";
import { renderWebview } from "./webview-content";

export const LIBRARY_VIEW_ID = "generalSimulator.library";

export class LibraryViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: GsimHost,
  ) {}

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    const registration = this.host.register("library", view.webview);
    view.onDidDispose(() => registration.dispose());

    view.webview.onDidReceiveMessage((message) => {
      this.host.handleCommonMessage(view.webview, message);
    });

    await renderWebview(
      this.extensionUri,
      view.webview,
      {
        role: "library",
        userSymbols: await this.host.readSymbols(),
        kernel: this.host.kernel.current ?? undefined,
      },
      this.host.log,
    );
  }
}
