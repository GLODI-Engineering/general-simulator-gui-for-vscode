import { useEffect, useRef, useState } from "react";

import { formatSiValue, parseSpiceNumber } from "../../netlist/spice-number";

interface VectorInputProps {
  label: string;
  value: number[] | undefined;
  onCommit: (value: number[]) => void;
  /** Unit for the echo, e.g. "s". Purely cosmetic. */
  unit?: string;
}

/**
 * A comma-separated list of numbers — transfer-function coefficients, sum
 * signs, and anything else that is a vector rather than a scalar.
 *
 * Three faults it used to have, all shared with `NumberInput` and all
 * capable of losing an edit without saying so:
 *
 * It parsed with `Number()`, so an engineering suffix made the whole vector
 * invalid and nothing committed. A coefficient of `1u` is perfectly
 * ordinary.
 *
 * `useState` reads its argument once, so a value changed underneath — undo,
 * a script, selecting a different block that reuses this component — left
 * the previous draft in the box, and that text is what the next blur
 * commits. That is not cosmetic: it can revert an edit made elsewhere.
 *
 * An empty box parsed to `[]`, which passed the validity check, so blurring
 * an empty field committed an empty vector over a real one.
 */
export function VectorInput({ label, value, onCommit, unit }: VectorInputProps) {
  const [draft, setDraft] = useState(value ? value.join(", ") : "");

  // Compared by *content*, not by reference: the parent builds a fresh array
  // literal on every render, so a reference check re-syncs constantly and
  // wipes the draft out from under whoever is typing.
  const text = value ? value.join(", ") : "";
  const committed = useRef(text);
  useEffect(() => {
    if (text !== committed.current) {
      committed.current = text;
      setDraft(text);
    }
  }, [text]);

  const pieces = draft
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const parsed = pieces.map((part) => parseSpiceNumber(part)?.value);
  const allNumbers = parsed.every((entry): entry is number => entry !== undefined);
  const invalid = pieces.length > 0 && !allNumbers;
  // An empty box is not a valid vector; it is an unfinished edit.
  const empty = pieces.length === 0;

  function commit(): void {
    if (invalid || empty || !allNumbers) return;
    const next = parsed as number[];
    committed.current = next.join(", ");
    onCommit(next);
  }

  const hint = invalid
    ? "Expected comma-separated numbers"
    : empty
      ? undefined
      : `= [${(parsed as number[]).map((n) => formatSiValue(n, unit ?? "")).join(", ")}]`;

  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        className={invalid ? "inspector-field__input is-invalid" : "inspector-field__input"}
        value={draft}
        title={hint}
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
