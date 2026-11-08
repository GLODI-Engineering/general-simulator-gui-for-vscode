import { useEffect, useRef, useState } from "react";

interface ListInputProps {
  label: string;
  value: string[] | undefined;
  onCommit: (value: string[]) => void;
}

/** Why a name is not usable as a port. */
export function listProblem(names: string[]): string | null {
  if (names.length === 0) return "At least one name is needed";
  const seen = new Set<string>();
  for (const name of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return `"${name}" is not a usable name — letters, digits and underscore, not starting with a digit`;
    }
    if (seen.has(name)) return `"${name}" appears twice — each port needs its own name`;
    seen.add(name);
  }
  return null;
}

export function splitNames(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * A list of names — the input and output ports of a scripted block.
 *
 * `type: "list"` had no editor, so it fell through to a plain string field
 * exactly as `matrix` did: the default is an array (`["u"]`), the field
 * stored a string, and the same parameter held two different types
 * depending on whether anyone had touched it.
 *
 * It also went unvalidated, which matters more here than it looks. These
 * names *are* the block's ports: a duplicate silently collapses two ports
 * into one, and a name that is not an identifier produces a port the
 * netlist cannot refer to. Both are discovered far from the edit that
 * caused them.
 */
export function ListInput({ label, value, onCommit }: ListInputProps) {
  const text = value ? value.join(", ") : "";
  const [draft, setDraft] = useState(text);

  // By content: the parent builds a fresh array each render.
  const committed = useRef(text);
  useEffect(() => {
    if (text !== committed.current) {
      committed.current = text;
      setDraft(text);
    }
  }, [text]);

  const names = splitNames(draft);
  const problem = draft.trim() === "" ? null : listProblem(names);
  const invalid = problem !== null;

  function commit(): void {
    if (invalid || names.length === 0) return;
    committed.current = names.join(", ");
    onCommit(names);
  }

  const hint =
    problem ??
    (names.length > 0 ? `${names.length} ${names.length === 1 ? "port" : "ports"}` : undefined);

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
