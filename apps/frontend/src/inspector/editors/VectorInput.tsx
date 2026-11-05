import { useState } from "react";

interface VectorInputProps {
  label: string;
  value: number[] | undefined;
  onCommit: (value: number[]) => void;
}

export function VectorInput({ label, value, onCommit }: VectorInputProps) {
  const [draft, setDraft] = useState(value ? value.join(", ") : "");

  const parsed = draft
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);
  const invalid = draft.length > 0 && parsed.some((entry) => !Number.isFinite(entry));

  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        className={invalid ? "inspector-field__input is-invalid" : "inspector-field__input"}
        value={draft}
        title={invalid ? "Expected comma-separated numbers" : undefined}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onBlur={() => {
          if (!invalid) {
            onCommit(parsed);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !invalid) {
            onCommit(parsed);
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}
