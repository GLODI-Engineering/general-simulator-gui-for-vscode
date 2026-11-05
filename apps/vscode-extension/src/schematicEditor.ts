/**
 * Custom Editor Provider for `*.gsim_sch`.
 *
 * Double-clicking a `.gsim_sch` file in the Explorer opens the schematic canvas
 * (`apps/frontend/src/canvas/**`) in a `WebviewPanel`, with a real document
 * lifecycle: VS Code owns dirty state, Save / Save As, Revert and hot-exit
 * backups through this provider.
 *
 * ## Content change vs. edit events
 *
 * We fire `CustomDocumentContentChangeEvent`, not `CustomDocumentEditEvent`.
 * The canvas already has its own undo stack (`canvas/undo.ts`, bound to Ctrl+Z
 * by `canvas/KeymapProvider`), and the VS Code API explicitly says an editor
 * that cannot use the workbench undo/redo stack must fire content-change
 * events instead — mixing the two would make a single Ctrl+Z undo twice.
 */
import * as vscode from "vscode";

import type { GsimHost } from "./host";
import { renderWebview } from "./webview-content";

export const SCHEMATIC_VIEW_TYPE = "generalSimulator.schematic";

class SchematicDocument implements vscode.CustomDocument {
  /** Latest text the webview reported; what Save writes out. */
  text: string;

  constructor(
    readonly uri: vscode.Uri,
    initialText: string,
  ) {
    this.text = initialText;
  }

  dispose(): void {
    /* no owned resources beyond the webview, which VS Code disposes */
  }
}

async function readText(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    // A brand-new / untitled schematic: let the frontend start from its
    // default empty model.
    return "";
  }
}

export class SchematicEditorProvider implements vscode.CustomEditorProvider<SchematicDocument> {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<SchematicDocument>
  >();
  readonly onDidChangeCustomDocument = this.onDidChangeEmitter.event;

  /** Live panels per document uri, so revert can push to all of them. */
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: GsimHost,
  ) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
  ): Promise<SchematicDocument> {
    // Hot-exit restore: prefer the backup over the on-disk file.
    const source = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    const text = openContext.untitledDocumentData
      ? new TextDecoder().decode(openContext.untitledDocumentData)
      : await readText(source);
    return new SchematicDocument(uri, text);
  }

  async resolveCustomEditor(
    document: SchematicDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const key = document.uri.toString();
    const set = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    set.add(panel);
    this.panels.set(key, set);

    const registration = this.host.register("schematic", panel.webview);
    panel.onDidDispose(() => {
      registration.dispose();
      set.delete(panel);
      if (set.size === 0) {
        this.panels.delete(key);
      }
    });

    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (this.host.handleCommonMessage(panel.webview, message)) {
        return;
      }
      const typed = message as { type?: string; text?: string };
      if (typed?.type === "gsim/documentChanged" && typeof typed.text === "string") {
        document.text = typed.text;
        this.onDidChangeEmitter.fire({ document });
      }
    });

    await renderWebview(
      this.extensionUri,
      panel.webview,
      {
        role: "schematic",
        documentUri: document.uri.toString(),
        documentText: document.text,
        kernel: this.host.kernel.current ?? undefined,
      },
      this.host.log,
    );
  }

  async saveCustomDocument(document: SchematicDocument): Promise<void> {
    await this.writeTo(document, document.uri);
  }

  async saveCustomDocumentAs(document: SchematicDocument, destination: vscode.Uri): Promise<void> {
    await this.writeTo(document, destination);
  }

  async revertCustomDocument(document: SchematicDocument): Promise<void> {
    const text = await readText(document.uri);
    document.text = text;
    for (const panel of this.panels.get(document.uri.toString()) ?? []) {
      await panel.webview.postMessage({ type: "gsim/setDocument", text });
    }
  }

  async backupCustomDocument(
    document: SchematicDocument,
    context: vscode.CustomDocumentBackupContext,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.writeTo(document, context.destination);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          /* already gone */
        }
      },
    };
  }

  private async writeTo(document: SchematicDocument, target: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(document.text));
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
    this.panels.clear();
  }
}
