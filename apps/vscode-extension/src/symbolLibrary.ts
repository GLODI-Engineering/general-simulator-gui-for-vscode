/**
 * User-authored components, stored as files in the workspace.
 *
 * The symbol editor used to merge a finished component straight into the
 * running catalog and nothing else. The component existed only in that
 * webview's memory: reload the window and it was gone, with no file to
 * recover it from and no way to share it. Authoring a part you lose on the
 * next reload is not authoring.
 *
 * So a saved component is written to `.gsim/symbols/<name>.gsim_sym` in the
 * workspace folder. One file per component, the format
 * `docs/specs/gsim-symbol-format-spec.md` defines and
 * `packages/gsim-model/src/gsim_model/gsim_sym.py` already reads and writes
 * on the Python side — so a component authored in the GUI can be loaded by a
 * script, and one authored by a script shows up in the library.
 *
 * In the workspace and not in global storage, deliberately: a component is
 * part of the design it belongs to, it should travel with the project in
 * version control, and a reviewer should be able to see it in the diff.
 */
import * as vscode from "vscode";

import { SYMBOLS_DIR, SYMBOL_EXTENSION, symbolFileName } from "./symbolLibrary-core";

export {
  SYMBOLS_DIR,
  SYMBOL_EXTENSION,
  SymbolLibraryError,
  symbolFileName,
} from "./symbolLibrary-core";

function symbolsFolder(workspace: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(workspace, ...SYMBOLS_DIR.split("/"));
}

/** The workspace folder user components are stored in, if there is one. */
export function symbolWorkspace(): vscode.Uri | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri ?? null;
}

/**
 * Write one component. Returns the file it landed in.
 *
 * Overwrites an existing component of the same id: re-saving after an edit is
 * the normal path, and a second copy under a mangled name would put two
 * entries with the same catalog key in the library.
 */
export async function saveSymbol(
  workspace: vscode.Uri,
  name: string,
  metadata: unknown,
): Promise<vscode.Uri> {
  const folder = symbolsFolder(workspace);
  await vscode.workspace.fs.createDirectory(folder);
  const file = vscode.Uri.joinPath(folder, symbolFileName(name));
  const text = `${JSON.stringify(metadata, null, 1)}\n`;
  await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(text));
  return file;
}

export interface LoadedSymbols {
  /** Parsed component metadata, ready to merge into the catalog. */
  metadata: unknown[];
  /** Files that could not be read or parsed, with the reason. */
  failures: Array<{ file: string; reason: string }>;
}

/**
 * Read every component in the workspace.
 *
 * A file that will not parse is reported, not thrown: one broken component
 * must not cost the user the rest of their library, and silently skipping it
 * would leave them wondering where their part went.
 */
export async function loadSymbols(workspace: vscode.Uri): Promise<LoadedSymbols> {
  const folder = symbolsFolder(workspace);
  const metadata: unknown[] = [];
  const failures: Array<{ file: string; reason: string }> = [];

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(folder);
  } catch {
    return { metadata, failures }; // no symbols folder yet — not an error
  }

  for (const [fileName, kind] of entries) {
    if (kind !== vscode.FileType.File || !fileName.endsWith(SYMBOL_EXTENSION)) {
      continue;
    }
    const file = vscode.Uri.joinPath(folder, fileName);
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof parsed?.name !== "string") {
        failures.push({ file: fileName, reason: 'missing a "name" field' });
        continue;
      }
      metadata.push(parsed);
    } catch (error) {
      failures.push({
        file: fileName,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Deterministic order so the catalog merges the same way every load.
  metadata.sort((a, b) =>
    String((a as { name: string }).name).localeCompare(String((b as { name: string }).name)),
  );
  return { metadata, failures };
}

/** Glob the symbols folder for a file watcher. */
export function symbolWatchPattern(workspace: vscode.WorkspaceFolder): vscode.RelativePattern {
  return new vscode.RelativePattern(workspace, `${SYMBOLS_DIR}/*${SYMBOL_EXTENSION}`);
}
