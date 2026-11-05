import { useState } from "react";

interface StringInputProps {
  label: string;
  value: string | undefined;
  onCommit: (value: string) => void;
}

export function StringInput({ label, value, onCommit }: StringInputProps) {
  const [draft, setDraft] = useState(value ?? "");

  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        className="inspector-field__input"
        value={draft}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onBlur={() => {
          onCommit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onCommit(draft);
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}
