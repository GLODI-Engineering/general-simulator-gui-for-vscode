import { useState } from "react";

interface NumberInputProps {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}

export function NumberInput({ label, value, onCommit, min, max }: NumberInputProps) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const numeric = Number(draft);
  const invalid =
    draft.length > 0 &&
    (!Number.isFinite(numeric) ||
      (min !== undefined && numeric < min) ||
      (max !== undefined && numeric > max));

  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        className={invalid ? "inspector-field__input is-invalid" : "inspector-field__input"}
        value={draft}
        title={
          invalid
            ? `Expected number${min !== undefined ? ` >= ${min}` : ""}${max !== undefined ? ` <= ${max}` : ""}`
            : undefined
        }
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onBlur={() => {
          if (!invalid && draft.length > 0) {
            onCommit(numeric);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !invalid && draft.length > 0) {
            onCommit(numeric);
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}
