import { useEffect, useMemo, useRef, useState } from "react";

import { markPaletteActionUsed, searchPaletteActions } from "./registry-bridge";

export interface CommandPaletteProps {
  onClose: () => void;
  onAction?: (actionId: string) => void;
}

export function CommandPalette({ onClose, onAction }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const results = useMemo(() => searchPaletteActions(query).slice(0, 24), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selected = results[selectedIndex] ?? null;

  return (
    <div
      className="command-palette__backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <section
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((current) => Math.max(current - 1, 0));
            return;
          }
          if (event.key === "Enter" && selected) {
            event.preventDefault();
            markPaletteActionUsed(selected.id);
            onAction?.(selected.id);
            onClose();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        <input
          ref={inputRef}
          className="command-palette__input"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search commands"
        />
        <ul className="command-palette__results">
          {results.length === 0 ? (
            <li className="command-palette__empty">No matching commands.</li>
          ) : null}
          {results.map((action, index) => (
            <li key={action.id}>
              <button
                type="button"
                className={
                  index === selectedIndex
                    ? "command-palette__item is-selected"
                    : "command-palette__item"
                }
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  markPaletteActionUsed(action.id);
                  onAction?.(action.id);
                  onClose();
                }}
              >
                <span>
                  <span className="command-palette__label">{action.label}</span>
                  <span className="command-palette__meta">{action.id}</span>
                </span>
                <span className="command-palette__chord">{action.chord}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default CommandPalette;
