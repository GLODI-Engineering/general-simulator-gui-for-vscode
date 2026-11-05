import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useRef } from "react";

import { resolveBinding } from "./keymap";
import type { KeyActionContext, KeymapContext } from "./keymap-types";

/**
 * KeymapProvider is the single document-level keyboard dispatcher (decision D3).
 * Every keyboard action resolves through `keymap.ts`; no other module installs a
 * `keydown` listener for canvas actions. Ported mouse interactions (wire segment
 * drag, probe placement) use `window` CustomEvents, not new keydown listeners,
 * so the reference editor's inline keydown handler is never reintroduced.
 */

export interface KeymapProviderProps extends PropsWithChildren {
  getContexts: () => KeymapContext[];
  onAction: (actionId: string, event: KeyboardEvent) => void;
}

const KeymapContextValue = createContext<KeymapProviderProps | null>(null);

function eventToChord(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (key === " ") {
    parts.push("Space");
  } else if (key.startsWith("Arrow")) {
    parts.push("Arrow");
  } else {
    parts.push(key);
  }
  return parts.join("+");
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") {
    return false;
  }
  const tag = element.tagName.toUpperCase();
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true
  );
}

export function KeymapProvider({ children, getContexts, onAction }: KeymapProviderProps) {
  const pendingRef = useRef<string[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const fallbackRef = useRef<string | null>(null);

  useEffect(() => {
    const clearPending = () => {
      pendingRef.current = [];
      fallbackRef.current = null;
      if (timeoutRef.current !== null) {
        globalThis.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const armPendingTimeout = () => {
      if (timeoutRef.current !== null) {
        globalThis.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = globalThis.setTimeout(() => {
        const fallbackAction = fallbackRef.current;
        pendingRef.current = [];
        fallbackRef.current = null;
        timeoutRef.current = null;
        if (fallbackAction) {
          onAction(fallbackAction, new KeyboardEvent("keydown"));
        }
      }, 700);
    };

    const listener = (event: KeyboardEvent) => {
      // A physical keyboard emits a bare modifier keydown (e.g. "Control")
      // before the real key. Feeding that through resolveBinding finds no match
      // and would clear an in-progress chord sequence — breaking double-tap
      // chords like Ctrl+.,Ctrl+. (quick insert). Ignore modifier-only keydowns.
      if (
        event.key === "Control" ||
        event.key === "Shift" ||
        event.key === "Alt" ||
        event.key === "Meta"
      ) {
        return;
      }
      // When the user is typing in a form field (e.g. the component-parameters
      // panel), keystrokes must edit the field — not trigger canvas actions.
      // Otherwise Backspace/Delete would delete the selected block and close the
      // panel. Only Escape is allowed through so dialogs can still be dismissed.
      if (isEditableTarget(event.target) && event.key !== "Escape") {
        return;
      }
      const chord = eventToChord(event);
      const context: KeyActionContext = {
        activeContexts: getContexts(),
        platform: navigator.platform.toLowerCase().includes("mac") ? "mac" : "other",
      };
      const resolved = resolveBinding(chord, context, pendingRef.current);

      if (resolved.pending.length > 0) {
        pendingRef.current = resolved.pending;
        fallbackRef.current = resolved.fallback?.id ?? null;
        armPendingTimeout();
        event.preventDefault();
        return;
      }

      clearPending();
      if (!resolved.binding) {
        return;
      }
      event.preventDefault();
      onAction(resolved.binding.id, event);
    };

    const onBlur = () => {
      clearPending();
    };

    window.addEventListener("keydown", listener);
    window.addEventListener("blur", onBlur);
    return () => {
      clearPending();
      window.removeEventListener("keydown", listener);
      window.removeEventListener("blur", onBlur);
    };
  }, [getContexts, onAction]);

  return (
    <KeymapContextValue.Provider value={{ children, getContexts, onAction }}>
      {children}
    </KeymapContextValue.Provider>
  );
}

export function useKeymap(): KeymapProviderProps {
  const value = useContext(KeymapContextValue);
  if (!value) {
    throw new Error("useKeymap must be used inside KeymapProvider");
  }
  return value;
}
