// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectorBlockProps {
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

function parseIndices(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((n) => !Number.isNaN(n));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
  }
  return [];
}

function indicesDisplay(indices: number[]): string {
  return indices.join(", ");
}

// ---------------------------------------------------------------------------
// SelectorInspector
// ---------------------------------------------------------------------------

export function SelectorInspector({ block, onChange }: SelectorBlockProps) {
  const { type, params } = block;

  // routing.selector — indices param
  if (type === "routing.selector") {
    const indices = parseIndices(params.indices);
    const displayValue = indicesDisplay(indices);

    return (
      <div className="selector-inspector">
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`sel-indices-${block.id}`}>
            Indices
          </label>
          <input
            id={`sel-indices-${block.id}`}
            type="text"
            className="inspector-input"
            defaultValue={displayValue}
            placeholder="e.g. 0, 1, 2"
            aria-label="indices"
            onBlur={(ev) => {
              const next = ev.currentTarget.value
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => !Number.isNaN(n));
              onChange?.({ ...params, indices: next });
            }}
          />
          <span className="inspector-hint">
            Zero-based element indices (comma-separated). Output dim = number of indices.
          </span>
        </div>
        {indices.length > 0 && (
          <div className="inspector-field inspector-field--read">
            <span className="inspector-label">Selected count</span>
            <span className="inspector-value">{indices.length}</span>
          </div>
        )}
      </div>
    );
  }

  // routing.manual_switch — current param (0 or 1)
  if (type === "routing.manual_switch") {
    const current = Number(params.current ?? 0);
    return (
      <div className="selector-inspector">
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`sw-current-${block.id}`}>
            Active input
          </label>
          <select
            id={`sw-current-${block.id}`}
            className="inspector-select"
            defaultValue={String(current)}
            onChange={(ev) => {
              onChange?.({ ...params, current: Number(ev.currentTarget.value) });
            }}
          >
            <option value="0">0 — in0</option>
            <option value="1">1 — in1</option>
          </select>
        </div>
      </div>
    );
  }

  // routing.multiport_switch — n_data param
  if (type === "routing.multiport_switch") {
    const nData = Number(params.n_data ?? 2);
    return (
      <div className="selector-inspector">
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`msw-ndata-${block.id}`}>
            Number of data inputs
          </label>
          <input
            id={`msw-ndata-${block.id}`}
            type="number"
            className="inspector-input"
            defaultValue={nData}
            min={2}
            step={1}
            onBlur={(ev) => {
              onChange?.({
                ...params,
                n_data: Math.max(2, Math.round(Number(ev.currentTarget.value))),
              });
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}

export default SelectorInspector;
