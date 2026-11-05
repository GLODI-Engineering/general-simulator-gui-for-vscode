/**
 * Loads a Vite-built HTML entry from the bundled frontend and hands it to
 * a webview.
 *
 * `apps/frontend` is built to `apps/frontend/dist`; packaging copies that tree
 * into the extension as `media/frontend` (see `.vscodeignore` / the build
 * script). Both locations are probed so the extension also runs straight from
 * a source checkout during development.
 */
import * as vscode from "vscode";

import type { WebviewInit, WebviewRole } from "./protocol";
import { isIntegrationTest } from "./test-mode";
import { kernelConnectSources, makeNonce, rewriteWebviewHtml } from "./webview-html";

const HTML_FOR_ROLE: Record<WebviewRole, string> = {
  schematic: "schematic.html",
  library: "library.html",
  waveform: "waveform.html",
};

/** Candidate roots for the built frontend, most-specific first. */
export function frontendRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [
    vscode.Uri.joinPath(extensionUri, "media", "frontend"),
    // Running from the monorepo checkout: apps/vscode-extension -> apps/frontend/dist
    vscode.Uri.joinPath(extensionUri, "..", "frontend", "dist"),
  ];
}

async function findFrontendRoot(extensionUri: vscode.Uri, htmlFile: string): Promise<vscode.Uri> {
  for (const root of frontendRoots(extensionUri)) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, htmlFile));
      return root;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    `General Simulator: could not find the built frontend (${htmlFile}). Run "pnpm --filter @gensim/frontend build" first.`,
  );
}

export async function renderWebview(
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  init: WebviewInit,
  log?: vscode.OutputChannel,
): Promise<void> {
  const htmlFile = HTML_FOR_ROLE[init.role];
  const root = await findFrontendRoot(extensionUri, htmlFile);
  log?.appendLine(`[webview:${init.role}] rendering ${htmlFile} from ${root.fsPath}`);

  webview.options = {
    enableScripts: true,
    localResourceRoots: [root],
  };

  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, htmlFile));
  const html = new TextDecoder().decode(bytes);

  webview.html = rewriteWebviewHtml(html, {
    toWebviewUri: (assetPath) =>
      webview.asWebviewUri(vscode.Uri.joinPath(root, ...assetPath.split("/"))).toString(),
    cspSource: webview.cspSource,
    nonce: makeNonce(),
    init: { ...init, testMode: isIntegrationTest() || undefined },
    connectSources: kernelConnectSources(),
  });
  log?.appendLine(`[webview:${init.role}] html set (${webview.html.length} bytes)`);
}
