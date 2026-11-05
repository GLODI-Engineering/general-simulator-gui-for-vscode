import { useState } from "react";

// The parser in param_expression implements exactly the grammar the format
// spec defines for these strings (§5.2), and evaluates it without generating
// code — which the VS Code webview's CSP requires.
import { tryEvalExpr as evalExpr } from "../persistence/param_expression";

interface Props {
  id?: string;
  ariaLabel?: string;
  value?: string | number;
  params?: Record<string, number>;
  onChange?: (v: string | number) => void;
}

/**
 * Resolve the displayed numeric value for a given input string and param map.
 * - bare number → the number itself
 * - identifier → look up in params
 * - `{...}` expression → evaluate
 */
function resolveDisplay(raw: string, params: Record<string, number>): number | null {
  if (raw.length === 0) return null;

  // expression form
  if (/^\{.*\}$/.test(raw)) {
    return evalExpr(raw.slice(1, -1), params);
  }

  // pure number
  const n = Number(raw);
  if (Number.isFinite(n) && raw.trim() !== "") return n;

  // identifier
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
    return params[raw] ?? null;
  }

  return null;
}

/**
 * Parse a committed string into the correct ParamValue type.
 * - Looks like a finite number → return as number
 * - Otherwise → return as string (identifier or expression)
 */
function parseCommit(raw: string): string | number {
  const n = Number(raw);
  if (raw.trim().length > 0 && Number.isFinite(n)) return n;
  return raw;
}

/**
 * ParamExpressionInput recognises three input forms:
 *   1. Plain number  →  commits as number
 *   2. Identifier     →  commits as string (param reference)
 *   3. `{…}` expr     →  commits as expression string
 *
 * The resolved numeric value is shown to the right of the input when available.
 */
export function ParamExpressionInput({ id, ariaLabel, value, params = {}, onChange }: Props) {
  const [draft, setDraft] = useState(value !== undefined ? String(value) : "");

  const resolved = resolveDisplay(draft, params);

  const commit = () => {
    if (draft.length > 0 && onChange) {
      onChange(parseCommit(draft));
    }
  };

  return (
    <span className="param-expression-input">
      <input
        id={id}
        aria-label={ariaLabel}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      {resolved !== null && <span className="param-expression-input__resolved">{resolved}</span>}
    </span>
  );
}

export default ParamExpressionInput;
