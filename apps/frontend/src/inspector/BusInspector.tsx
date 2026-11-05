/**
 * BusInspector — FE-64
 *
 * Inspector panel for bus routing blocks:
 *   - routing.bus_creator  — shows comma-separated elements param; each element rendered as a chip
 *   - routing.bus_selector — same display
 *   - routing.bus_assignment — same display
 *   - routing.data_store_memory / data_store_read / data_store_write — shows store name param
 *     with inline error if data_store_memory name collides with another block in the model.
 */

import { useGraphStore } from "../store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BusBlockProps {
  block: {
    id: string;
    type: string;
    params: Record<string, unknown>;
  };
  onChange?: (params: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElements(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function ElementChips({ elements }: { elements: string[] }) {
  if (elements.length === 0) {
    return <span className="inspector-hint">No elements configured.</span>;
  }
  return (
    <div className="bus-inspector__chips" role="list" aria-label="Bus elements">
      {elements.map((el) => (
        <span key={el} className="bus-inspector__chip" role="listitem">
          {el}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BusInspector
// ---------------------------------------------------------------------------

export function BusInspector({ block, onChange }: BusBlockProps) {
  const { type, params } = block;

  // Data-store namespace check: collect all data_store_memory names from the model
  const allBlocks = useGraphStore((state) => state.document.model.blocks);
  const memoryNames: string[] = allBlocks
    .filter((b) => b.type === "routing.data_store_memory")
    .map((b) => String(b.params?.name ?? ""));

  const nameCount: Record<string, number> = {};
  for (const n of memoryNames) {
    nameCount[n] = (nameCount[n] ?? 0) + 1;
  }

  // ---- bus_creator / bus_selector / bus_assignment ----
  if (
    type === "routing.bus_creator" ||
    type === "routing.bus_selector" ||
    type === "routing.bus_assignment"
  ) {
    const elements = parseElements(params.elements);
    const rawValue = Array.isArray(params.elements)
      ? (params.elements as string[]).join(", ")
      : typeof params.elements === "string"
        ? params.elements
        : "";

    return (
      <div className="bus-inspector">
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`elements-${block.id}`}>
            Elements
          </label>
          <input
            id={`elements-${block.id}`}
            type="text"
            className="inspector-input"
            defaultValue={rawValue}
            placeholder="e.g. x, y, z"
            onBlur={(ev) => {
              const next = ev.currentTarget.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              onChange?.({ ...params, elements: next });
            }}
          />
        </div>
        <ElementChips elements={elements} />
      </div>
    );
  }

  // ---- data_store_memory ----
  if (type === "routing.data_store_memory") {
    const name = String(params.name ?? "");
    const isDuplicate = (nameCount[name] ?? 0) > 1;
    return (
      <div className="bus-inspector">
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`dsm-name-${block.id}`}>
            Store name
          </label>
          <input
            id={`dsm-name-${block.id}`}
            type="text"
            className={`inspector-input${isDuplicate ? " inspector-input--error" : ""}`}
            defaultValue={name}
            onBlur={(ev) => {
              onChange?.({ ...params, name: ev.currentTarget.value });
            }}
          />
          {isDuplicate && (
            <span className="inspector-error" role="alert">
              Duplicate data store name &ldquo;{name}&rdquo; — store names must be unique.
            </span>
          )}
        </div>
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`dsm-init-${block.id}`}>
            Initial value
          </label>
          <input
            id={`dsm-init-${block.id}`}
            type="number"
            className="inspector-input"
            defaultValue={Number(params.initial_value ?? 0)}
            onBlur={(ev) => {
              onChange?.({ ...params, initial_value: Number(ev.currentTarget.value) });
            }}
          />
        </div>
      </div>
    );
  }

  // ---- data_store_read / data_store_write ----
  if (type === "routing.data_store_read" || type === "routing.data_store_write") {
    const storeName = String(params.store ?? "");
    const isUnknown = storeName !== "" && !memoryNames.includes(storeName);
    return (
      <div className="bus-inspector">
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`ds-store-${block.id}`}>
            Store name
          </label>
          <input
            id={`ds-store-${block.id}`}
            type="text"
            className={`inspector-input${isUnknown ? " inspector-input--error" : ""}`}
            defaultValue={storeName}
            onBlur={(ev) => {
              onChange?.({ ...params, store: ev.currentTarget.value });
            }}
          />
          {isUnknown && (
            <span className="inspector-error" role="alert">
              Unknown data store &ldquo;{storeName}&rdquo; — no matching data_store_memory found.
            </span>
          )}
        </div>
      </div>
    );
  }

  // Fallback — shouldn't normally be reached
  return null;
}

export default BusInspector;
