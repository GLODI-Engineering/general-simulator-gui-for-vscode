/**
 * SwitchInspector — FE-64
 *
 * Inspector panel for routing.switch — shows and edits criteria and threshold
 * atomically (both are committed in a single onChange call).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwitchBlockProps {
  block: {
    id: string;
    type: string;
    params: Record<string, unknown>;
  };
  onChange?: (params: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Allowed criteria forms (spec §15.7)
// ---------------------------------------------------------------------------

const CRITERIA_OPTIONS = ["u2 >= threshold", "u2 > threshold", "u2 ~= 0"] as const;

type CriteriaOption = (typeof CRITERIA_OPTIONS)[number];

function isCriteriaOption(value: unknown): value is CriteriaOption {
  return typeof value === "string" && (CRITERIA_OPTIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// SwitchInspector
// ---------------------------------------------------------------------------

export function SwitchInspector({ block, onChange }: SwitchBlockProps) {
  const { params } = block;

  const criteria = isCriteriaOption(params.criteria) ? params.criteria : "u2 >= threshold";

  const threshold = typeof params.threshold === "number" ? params.threshold : 0;

  /**
   * Commit BOTH criteria and threshold atomically in a single onChange call
   * so the block params are always internally consistent.
   */
  function commitCriteria(newCriteria: CriteriaOption) {
    onChange?.({ ...params, criteria: newCriteria, threshold });
  }

  function commitThreshold(newThreshold: number) {
    onChange?.({ ...params, criteria, threshold: newThreshold });
  }

  const showThreshold = criteria !== "u2 ~= 0";

  return (
    <div className="switch-inspector">
      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`sw-criteria-${block.id}`}>
          Criteria
        </label>
        <select
          id={`sw-criteria-${block.id}`}
          className="inspector-select"
          value={criteria}
          onChange={(ev) => {
            const next = ev.currentTarget.value;
            if (isCriteriaOption(next)) {
              commitCriteria(next);
            }
          }}
        >
          {CRITERIA_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {showThreshold && (
        <div className="inspector-field">
          <label className="inspector-label" htmlFor={`sw-threshold-${block.id}`}>
            Threshold
          </label>
          <input
            id={`sw-threshold-${block.id}`}
            type="number"
            className="inspector-input"
            defaultValue={threshold}
            step="any"
            onBlur={(ev) => {
              commitThreshold(Number(ev.currentTarget.value));
            }}
          />
        </div>
      )}
    </div>
  );
}

export default SwitchInspector;
