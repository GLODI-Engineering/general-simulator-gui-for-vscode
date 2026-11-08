import { useEffect, useRef, useState } from "react";

import { formatMatrixLiteral, matrixShape, parseMatrixLiteral } from "../../netlist/matrix-literal";

interface MatrixInputProps {
  label: string;
  value: number[][] | undefined;
  onCommit: (value: number[][]) => void;
}

/**
 * A matrix parameter — state-space `A`, `B`, `C`, `D` and the like.
 *
 * `type: "matrix"` had no editor at all and fell through to a plain string
 * field, so a matrix was free text that was never parsed, never checked for
 * shape, and stored as whatever had been typed. A ragged `A` or a MATLAB
 * literal reached the engine unexamined.
 *
 * One notation is enforced, Python's, and MATLAB's is *named* rather than
 * merely refused — being told "invalid matrix" after typing a matrix that
 * works everywhere else is not useful. The shape is shown beside the box,
 * because in a state-space model a wrong shape is the expensive mistake and
 * it is invisible in the text.
 */
export function MatrixInput({ label, value, onCommit }: MatrixInputProps) {
  const text = value ? formatMatrixLiteral(value) : "";
  const [draft, setDraft] = useState(text);

  // Compared by content: the parent builds a fresh array every render, so a
  // reference check would wipe the draft out from under whoever is typing.
  const committed = useRef(text);
  useEffect(() => {
    if (text !== committed.current) {
      committed.current = text;
      setDraft(text);
    }
  }, [text]);

  const parsed = draft.trim() === "" ? null : parseMatrixLiteral(draft);
  const invalid = parsed !== null && !parsed.ok;

  function commit(): void {
    if (parsed === null || !parsed.ok) return;
    committed.current = formatMatrixLiteral(parsed.value);
    onCommit(parsed.value);
  }

  const hint = parsed === null ? undefined : parsed.ok ? matrixShape(parsed.value) : parsed.reason;

  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        className={invalid ? "inspector-field__input is-invalid" : "inspector-field__input"}
        value={draft}
        title={hint}
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      {hint && (
        <span className={`inspector-field__hint${invalid ? " is-invalid" : ""}`}>{hint}</span>
      )}
    </label>
  );
}
