import { useState } from "react";
import type { ParamEntry } from "../model/types";
import { ParamExpressionInput } from "./ParamExpressionInput";

interface Props {
  entry: ParamEntry;
  /** resolved numeric values for all sibling params */
  resolvedParams: Record<string, number>;
  nameError?: string | null;
  valueError?: string | null;
  onCommitName: (name: string) => void;
  onCommitValue: (value: string | number) => void;
  onCommitUnit: (unit: string) => void;
  onCommitDoc: (doc: string) => void;
  onDelete: () => void;
}

function SimpleInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onCommit(draft);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/**
 * ParamRowEditor renders a single committed param row.
 *
 * The name is displayed as a `<span>` (visible text) so it is discoverable by
 * testing-library `getByText`. Value, unit, and doc are always-editable inputs.
 */
export function ParamRowEditor({
  entry,
  resolvedParams,
  nameError,
  valueError,
  onCommitValue,
  onCommitUnit,
  onCommitDoc,
  onDelete,
}: Props) {
  return (
    <tr className="param-row">
      <td className="param-row__name">
        {/* Name shown as text so getByText works; editing via the pending row flow */}
        <span className="param-row__name-label">{entry.name}</span>
        {nameError ? <span className="param-row__error">{nameError}</span> : null}
      </td>
      <td className="param-row__value">
        <ParamExpressionInput
          value={entry.value as string | number}
          params={resolvedParams}
          onChange={onCommitValue}
        />
        {valueError ? <span className="param-row__error">{valueError}</span> : null}
      </td>
      <td className="param-row__unit">
        <SimpleInput value={entry.unit ?? ""} placeholder="unit" onCommit={onCommitUnit} />
      </td>
      <td className="param-row__doc">
        <SimpleInput value={entry.doc ?? ""} placeholder="description" onCommit={onCommitDoc} />
      </td>
      <td className="param-row__actions">
        <button type="button" aria-label="Delete param" onClick={onDelete}>
          ×
        </button>
      </td>
    </tr>
  );
}

export default ParamRowEditor;
