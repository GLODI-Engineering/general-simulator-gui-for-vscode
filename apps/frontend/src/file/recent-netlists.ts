import { useIpcStore } from "../store";

/**
 * File > Import SPICE netlist… entries recently loaded — separate from
 * `listRecentFiles()` (file-ops.ts), which only tracks saved *models*
 * (.gsim_sch) through the StorageAdapter. An imported netlist is raw text,
 * not a ModelDocument, so it never went through that adapter and never
 * showed up in Recent Files — reported live as a real gap by a user whose
 * main way of loading a netlist to simulate *is* Import, not File > Open.
 *
 * Stores the netlist text itself (not just a file path) so a "Recent
 * Netlists" entry can be reopened instantly without a filesystem prompt —
 * consistent with how a re-picked file would otherwise need to be reread
 * from disk anyway, and works the same in the browser (IndexedDB-backed)
 * adapter, which has no real filesystem access to a remembered path.
 */

const STORAGE_KEY = "gensim.file.recent-netlists.v1";
const MAX_ENTRIES = 8;

export interface RecentNetlistEntry {
  id: string;
  name: string;
  text: string;
  importedAt: string;
}

function hasLocalStorage(): boolean {
  return typeof globalThis !== "undefined" && "localStorage" in globalThis;
}

export function listRecentNetlists(): RecentNetlistEntry[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RecentNetlistEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordRecentNetlist(name: string, text: string): void {
  if (!hasLocalStorage()) return;
  try {
    const existing = listRecentNetlists().filter((entry) => entry.name !== name);
    const next: RecentNetlistEntry[] = [
      { id: `netlist-${Date.now()}`, name, text, importedAt: new Date().toISOString() },
      ...existing,
    ].slice(0, MAX_ENTRIES);
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded or storage unavailable — recent-netlist tracking is a
    // convenience, not load-bearing; the import itself already succeeded.
  }
}

/**
 * Reopen a Recent Netlists entry — same effect as re-picking the file via
 * File > Import SPICE netlist…, but instant (uses the text already stored
 * by recordRecentNetlist() instead of a filesystem prompt).
 */
export function openRecentNetlist(entry: RecentNetlistEntry): void {
  useIpcStore.getState().resetForNewModel();
  useIpcStore.getState().setImportedNetlist(entry.text);
  useIpcStore.getState().setLastNetlist(entry.text);
  useIpcStore.getState().setActiveEditorTab("core.netlist");
  recordRecentNetlist(entry.name, entry.text);
}

export function clearRecentNetlists(): void {
  if (!hasLocalStorage()) return;
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
