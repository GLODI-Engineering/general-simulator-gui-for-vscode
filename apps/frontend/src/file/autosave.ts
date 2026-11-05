export interface AutosaveOptions {
  debounceMs?: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();

export function emit(eventName: string): void {
  if (eventName !== "commit") {
    return;
  }
  for (const listener of listeners) {
    listener();
  }
}

export function setupAutosave(
  save: () => Promise<void> | void,
  options: AutosaveOptions = {},
): () => void {
  const debounceMs = options.debounceMs ?? 500;
  let timeout: number | null = null;

  const listener = () => {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      timeout = null;
      void save();
    }, debounceMs);
  };

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (timeout !== null) {
      window.clearTimeout(timeout);
      timeout = null;
    }
  };
}

setupAutosave.emit = emit;

export default setupAutosave;
