interface DropdownProps {
  label: string;
  value: string | undefined;
  choices: string[];
  onCommit: (value: string) => void;
}

export function Dropdown({ label, value, choices, onCommit }: DropdownProps) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      <select
        className="inspector-field__input"
        value={value ?? choices[0] ?? ""}
        onChange={(event) => {
          onCommit(event.currentTarget.value);
        }}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}
