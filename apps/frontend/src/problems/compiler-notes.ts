/**
 * Show the compiler's info-level notes in the Problems panel.
 *
 * These are decisions the compiler made *for* the user, not failures. The one
 * that matters is the DC reference it adds for a node nothing else ties down:
 * such a node does not make the solve fail, it makes it return a different
 * answer, so leaving the decision invisible is the one behaviour that actually
 * misleads. The notes ride back on `simulate_result` and land here.
 *
 * Namespaced like every other producer in this panel (see `port-validation.ts`)
 * so publishing replaces only this module's own entries and leaves a run's
 * validation errors alone.
 */

import { useIpcStore } from "../store";

/** Problems this module owns; everything else in the panel is left alone. */
const OWNED = /^compiler-note:/;

export function compilerNoteProblems(
  notes: readonly string[],
): Array<{ id: string; severity: "info"; message: string }> {
  return notes.map((message, i) => ({
    id: `compiler-note:${i}`,
    severity: "info" as const,
    message,
  }));
}

/**
 * Replace this module's notes with `notes`, preserving problems raised elsewhere.
 *
 * Called on every `simulate_result`, including runs that produce no notes — that
 * is what clears the previous run's, so a note never outlives the document edit
 * that fixed it.
 */
export function publishCompilerNotes(notes: readonly string[]): void {
  const ipc = useIpcStore.getState();
  const others = ipc.problems.filter((problem) => !OWNED.test(problem.id));
  const mine = compilerNoteProblems(notes);
  // Nothing before, nothing now: skip the store write entirely, since the
  // common case is a clean sheet and a quiet panel.
  if (others.length === ipc.problems.length && mine.length === 0) return;
  ipc.setProblems([...others, ...mine]);
}
