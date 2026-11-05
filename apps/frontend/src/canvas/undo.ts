import { useGraphStore } from "../store";

export function undo() {
  useGraphStore.getState().undo();
}

export function redo() {
  useGraphStore.getState().redo();
}

export function clearUndoStack() {
  useGraphStore.getState().clearHistory();
}

export function getUndoStack() {
  return useGraphStore.getState().undoStack;
}
