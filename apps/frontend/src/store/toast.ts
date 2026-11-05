import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
}

export interface DiagnosticEvent {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface ToastStoreState {
  toasts: Toast[];
  diagnostics: DiagnosticEvent[];
  pushToast: (message: string, ttlMs?: number) => string;
  pushDiagnostic: (event: string, payload: Record<string, unknown>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStoreState>((set, get) => ({
  toasts: [],
  diagnostics: [],
  pushToast: (message, ttlMs = 3500) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
    globalThis.setTimeout(() => {
      const { removeToast } = get();
      removeToast(id);
    }, ttlMs);
    return id;
  },
  pushDiagnostic: (event, payload) => {
    const item: DiagnosticEvent = {
      id: crypto.randomUUID(),
      event,
      payload,
      ts: Date.now(),
    };
    set((state) => ({ diagnostics: [...state.diagnostics.slice(-49), item] }));
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  clearToasts: () => {
    set({ toasts: [] });
  },
}));
