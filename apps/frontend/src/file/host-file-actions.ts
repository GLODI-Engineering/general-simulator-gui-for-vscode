/**
 * File actions that the *embedding host* owns, not this app.
 *
 * Inside the VS Code Custom Editor (`generalSimulator.schematic`) the
 * `.gsim_sch` document lifecycle belongs entirely to VS Code:
 * `SchematicEditorProvider` fires `onDidChangeCustomDocument` for every graph
 * mutation the webview reports (see `vscode/schematic-main.tsx`'s
 * `installDocumentBridge`), and VS Code drives `saveCustomDocument` /
 * `saveCustomDocumentAs` / `revertCustomDocument` / hot-exit backup from that.
 *
 * So the toolbar's own New/Open/Save buttons must NOT go through
 * `file/file-ops.ts` + the web/desktop storage adapter there — doing so would
 * write a second, parallel copy of the model to browser storage or a
 * separately-picked path while VS Code's tab stayed dirty. Instead each button
 * asks the extension host to run the workbench command a VS Code user would
 * otherwise reach for. Because dirty tracking is already automatic, the Save
 * button's whole job is to funnel into VS Code's own save.
 *
 * Everywhere else — the standalone Tauri app, plain browser/dev builds,
 * vitest — `isVsCodeHost()` is false and this module is inert, so the existing
 * behaviour is untouched.
 */
import { isVsCodeHost, postToHost } from "../ipc/vscode-host";

/**
 * If the app is hosted by VS Code and `actionId` is a File action VS Code
 * owns, hand it off and return true. Returns false otherwise, so the caller
 * falls through to the app's own storage-adapter flow.
 */
export function handleHostFileAction(actionId: string): boolean {
  if (!isVsCodeHost()) {
    return false;
  }
  switch (actionId) {
    case "file.new":
      // The extension's own "General Simulator: New Schematic" command:
      // picks a path, writes the file, opens it in a fresh custom editor tab.
      postToHost({ type: "gsim/newSchematic" });
      return true;
    case "file.open":
      // VS Code's open dialog + `vscode.openWith`, so the result is a real
      // editor tab with a real document, not an in-memory load.
      postToHost({ type: "gsim/openSchematic" });
      return true;
    case "file.save":
      postToHost({ type: "gsim/saveDocument" });
      return true;
    case "file.save-as":
      postToHost({ type: "gsim/saveDocument", as: true });
      return true;
    case "file.close":
      // Resetting the store here would instead report an empty document to
      // the host and leave the tab dirty with nothing in it.
      postToHost({ type: "gsim/closeDocument" });
      return true;
    default:
      return false;
  }
}
