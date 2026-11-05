import { useId, useState } from "react";

import type { PortKindDomain } from "../model/types";
import { type PortSide, SYMBOL_PORT_DOMAINS, useSymbolEditorStore } from "./store";

const SIDES: PortSide[] = ["left", "right", "top", "bottom"];

export interface PortCreateFormProps {
  initialSide: PortSide;
  initialOffset: number;
  onConfirm: (port: {
    id: string;
    label: string;
    side: PortSide;
    offset: number;
    kind: PortKindDomain;
    direction: "input" | "output";
  }) => void;
  onCancel: () => void;
}

// FE-176: placing a port used to silently addPort() on click, with no
// confirmation step and no way to set its electrical/signal kind up
// front (it landed with whatever the symbol's overall domain default
// was, only editable afterward in the side panel). This form is the
// missing OK/Cancel step, asked for explicitly, and it's also where the
// port's type gets asked — not deferred to a separate edit.
export function PortCreateForm({
  initialSide,
  initialOffset,
  onConfirm,
  onCancel,
}: PortCreateFormProps) {
  const titleId = useId();
  const domain = useSymbolEditorStore((s) => s.domain);
  const nextIndex = useSymbolEditorStore((s) => s.ports.length + 1);

  const [id, setId] = useState(`p${nextIndex}`);
  const [label, setLabel] = useState(`P${nextIndex}`);
  const [side, setSide] = useState<PortSide>(initialSide);
  const [offset, setOffset] = useState(initialOffset);
  const [kind, setKind] = useState<PortKindDomain>(domain);
  const [direction, setDirection] = useState<"input" | "output">("input");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!id.trim()) return;
    onConfirm({ id, label, side, offset, kind, direction });
  }

  return (
    <div className="sim-settings-backdrop" onMouseDown={onCancel}>
      <div
        className="port-create-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <strong id={titleId}>New Port</strong>
          <div className="port-create-form__fields">
            <label>
              Id
              <input value={id} onChange={(e) => setId(e.target.value)} required />
            </label>
            <label>
              Label
              <input value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label>
              Side
              <select value={side} onChange={(e) => setSide(e.target.value as PortSide)}>
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Offset
              <input
                type="number"
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
              />
            </label>
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value as PortKindDomain)}>
                {SYMBOL_PORT_DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "input" | "output")}
              >
                <option value="input">input</option>
                <option value="output">output</option>
              </select>
            </label>
          </div>
          <div className="port-create-form__actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit">OK</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PortCreateForm;
