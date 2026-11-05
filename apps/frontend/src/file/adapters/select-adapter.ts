import type { StorageAdapter } from "../StorageAdapter";
import { IndexedDbAdapter } from "./IndexedDbAdapter";

/**
 * Storage adapter for the webview's own, secondary persistence.
 *
 * Inside the VS Code custom editor the `.gsim_sch` document lifecycle belongs
 * to VS Code, not to this app — see `file/host-file-actions.ts`. This adapter
 * is only what the webview falls back on for browser-local state (autosave
 * drafts, recent-file lists) and for the dev harness, where no extension host
 * exists. A webview origin always has IndexedDB, so there is one adapter.
 */
export function selectAdapter(): StorageAdapter {
  return new IndexedDbAdapter();
}

export default selectAdapter;
