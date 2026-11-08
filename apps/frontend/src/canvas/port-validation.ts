/**
 * Report wire endpoints that name a port their block does not have.
 *
 * The detector (`findUnknownPortRefs`) is only half the fix. A wire like
 * this is not refused anywhere — the renderer falls back to a position and
 * draws it somewhere plausible — so without something watching the document
 * and saying so, the sheet simply looks connected while a quarter of its
 * connections are absent.
 *
 * Kept out of the detector so the detector stays pure and testable, and
 * kept out of the graph store so validation does not become something the
 * store has to know about.
 */

import type { BlockMetadata } from "../model/types";
import { useGraphStore, useIpcStore, useLibraryStore } from "../store";
import { findUnknownPortRefs } from "./topology";

/** Problems this module owns; everything else in the panel is left alone. */
const OWNED = /^unknown-(port|block):/;

export function portProblemsFor(
  model: { blocks: Array<{ id: string; type: string }>; wires: unknown[] },
  catalog: Record<string, BlockMetadata>,
): Array<{ id: string; severity: "error"; message: string }> {
  return findUnknownPortRefs(model as never, catalog).map((issue) => ({
    id: issue.id,
    severity: "error" as const,
    message: issue.summary,
  }));
}

/**
 * Replace this module's problems, preserving any raised elsewhere — a run's
 * validation errors share the same panel and must not be wiped by an edit.
 */
export function publishPortProblems(): void {
  const model = useGraphStore.getState().document.model;
  const catalog = useLibraryStore.getState().catalog;
  const ipc = useIpcStore.getState();
  const others = ipc.problems.filter((problem) => !OWNED.test(problem.id));
  const mine = portProblemsFor(model as never, catalog);

  // Setting unconditionally would make every keystroke a store write; the
  // panel is usually empty and usually stays empty.
  if (others.length === ipc.problems.length && mine.length === 0) return;
  ipc.setProblems([...others, ...mine]);
}

let installed = false;

export function installPortValidation(): () => void {
  if (installed) {
    return () => {
      /* already installed */
    };
  }
  installed = true;

  publishPortProblems();
  const unsubscribe = useGraphStore.subscribe((state, previous) => {
    if (state.document.model === previous.document.model) return;
    publishPortProblems();
  });

  return () => {
    unsubscribe();
    installed = false;
  };
}

/** Test seam. */
export function resetPortValidation(): void {
  installed = false;
}
