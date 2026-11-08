import { useEffect, useRef, useState } from "react";

import { formatSiValue, isAmbiguousSuffix, parseSpiceNumber } from "../../netlist/spice-number";

interface NumberInputProps {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Unit for the echo, e.g. "Ω". Purely cosmetic. */
  unit?: string;
}

/**
 * A parameter value, in the netlist's own number grammar.
 *
 * This used to read the box with `Number()`, which answers `NaN` for every
 * engineering suffix there is. So typing `10u` — the most ordinary thing a
 * power electronics engineer does — marked the field invalid and the value
 * was *never committed*. The box kept showing what had been typed, so it
 * looked saved, and nothing said otherwise until a run used the old value.
 *
 * Two further things it now does, both because the grammar is surprising
 * rather than because the input is hard:
 *
 * The parsed value is echoed in SI as you type, so what the solver will read
 * is visible before a run turns a typo into a result.
 *
 * A bare `M` is called out. In SPICE it is milli — `MEG` is mega — and in
 * power electronics `1M` is naturally read as a megohm. Getting milli is a
 * factor of 10^9 on a resistance, with a value that stays legal the whole
 * way down, so nothing downstream can catch it.
 */
export function NumberInput({ label, value, onCommit, min, max, unit }: NumberInputProps) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));

  // Follow the value when it changes underneath us — a parameter set from
  // elsewhere (undo, a script, another panel) used to leave this box showing
  // a stale draft, because `useState` only reads its argument once.
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value === undefined ? "" : String(value));
    }
  }, [value]);

  const parsed = draft.trim().length > 0 ? parseSpiceNumber(draft) : null;
  const outOfRange =
    parsed !== null &&
    ((min !== undefined && parsed.value < min) || (max !== undefined && parsed.value > max));
  const invalid = draft.trim().length > 0 && (parsed === null || outOfRange);
  const ambiguous = !invalid && isAmbiguousSuffix(draft);

  function commit(): void {
    if (invalid || parsed === null) return;
    committed.current = parsed.value;
    onCommit(parsed.value);
  }

  const hint = (() => {
    if (parsed === null) {
      return draft.trim().length > 0 ? "Not a number this simulator can read" : undefined;
    }
    if (outOfRange) {
      const bounds = [
        min !== undefined ? `>= ${min}` : null,
        max !== undefined ? `<= ${max}` : null,
      ]
        .filter(Boolean)
        .join(" and ");
      return `Out of range (${bounds})`;
    }
    return `= ${formatSiValue(parsed.value, unit ?? "")}`;
  })();

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
        <span
          className={`inspector-field__hint${invalid ? " is-invalid" : ""}${
            ambiguous ? " is-warning" : ""
          }`}
        >
          {hint}
          {ambiguous && " — M is milli here; mega is MEG"}
        </span>
      )}
    </label>
  );
}
