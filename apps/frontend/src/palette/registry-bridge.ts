import { keyBindings } from "../canvas/keymap";

export interface PaletteAction {
  id: string;
  label: string;
  chord: string;
  contexts: string[];
}

const recency = new Map<string, number>();

export function listPaletteActions(): PaletteAction[] {
  return keyBindings.map((binding) => ({
    id: binding.id,
    label: binding.label,
    chord: binding.chord,
    contexts: [...binding.contexts],
  }));
}

export function markPaletteActionUsed(actionId: string): void {
  recency.set(actionId, Date.now());
}

export function searchPaletteActions(query: string): PaletteAction[] {
  const needle = query.trim().toLowerCase();
  return listPaletteActions()
    .map((action) => {
      const haystack = `${action.label} ${action.id} ${action.chord}`.toLowerCase();
      const textualScore = needle.length === 0 ? 0 : haystack.includes(needle) ? 100 : -1;
      const recentScore = recency.get(action.id) ?? 0;
      return { action, score: textualScore, recentScore };
    })
    .filter((entry) => needle.length === 0 || entry.score >= 0)
    .sort(
      (left, right) =>
        right.recentScore - left.recentScore ||
        right.score - left.score ||
        left.action.label.localeCompare(right.action.label),
    )
    .map((entry) => entry.action);
}
