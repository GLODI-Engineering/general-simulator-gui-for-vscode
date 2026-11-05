import { useEffect, useState } from "react";

import type { ModelEntry, StorageAdapter } from "../file/StorageAdapter";

export interface StartupModalProps {
  adapter: Pick<StorageAdapter, "list">;
  onOpen: (id: string) => void;
  onNew: () => void;
  onImport?: () => void;
}

export function StartupModal({ adapter, onOpen, onNew, onImport }: StartupModalProps) {
  const [entries, setEntries] = useState<ModelEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void adapter.list().then((models) => {
      if (!cancelled) {
        setEntries(models);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  return (
    <div className="command-palette__backdrop">
      <section
        className="startup-modal"
        data-testid="startup-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Startup"
      >
        <header className="startup-modal__header">
          <strong>Open recent model</strong>
        </header>
        <div className="startup-modal__actions">
          <button type="button" onClick={onNew}>
            New model
          </button>
          <button type="button" onClick={onImport}>
            Import .gsim file...
          </button>
        </div>
        <ul className="recent-models-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="startup-modal__recent"
                onClick={() => onOpen(entry.id)}
              >
                <span>{entry.name}</span>
                <span className="command-palette__meta">{entry.openedAt}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default StartupModal;
