/**
 * FE-61: ICEditor — initial conditions editor.
 * Distinguishes node ICs (net name + value) from block-state ICs (block id + state + value).
 * Autocomplete via <datalist> for net names and block ids.
 */
import { useState } from "react";

interface Props {
  ics?: Array<Record<string, unknown>>;
  netNames?: string[];
  blockIds?: string[];
  onChange?: (ics: Array<Record<string, unknown>>) => void;
}

export function ICEditor({ ics = [], netNames = [], blockIds = [], onChange }: Props) {
  const [icKind, setIcKind] = useState<"node" | "block">("node");
  const [netDraft, setNetDraft] = useState("");
  const [blockDraft, setBlockDraft] = useState("");
  const [stateDraft, setStateDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");

  const parseValue = (v: string): string | number => {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== "" ? n : v;
  };

  const addNodeIC = () => {
    if (!netDraft) return;
    onChange?.([...ics, { kind: "node", net: netDraft, value: parseValue(valueDraft) }]);
    setNetDraft("");
    setValueDraft("");
  };

  const addBlockIC = () => {
    if (!blockDraft) return;
    onChange?.([
      ...ics,
      {
        kind: "block",
        block_id: blockDraft,
        state: stateDraft,
        value: parseValue(valueDraft),
      },
    ]);
    setBlockDraft("");
    setStateDraft("");
    setValueDraft("");
  };

  const removeIC = (index: number) => {
    onChange?.(ics.filter((_, i) => i !== index));
  };

  return (
    <div className="ic-editor">
      {/* Existing IC list */}
      <div className="ic-editor__list">
        {ics.map((ic, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional list
          <div key={idx} className="ic-editor__row">
            <span className="ic-editor__kind">{String(ic.kind ?? "node")}</span>
            {ic.kind === "block" ? (
              <span>
                {String(ic.block_id)}.{String(ic.state)}: {String(ic.value)}
              </span>
            ) : (
              <span>
                {String(ic.net)}: {String(ic.value)}
              </span>
            )}
            <button type="button" aria-label={`Remove IC ${idx}`} onClick={() => removeIC(idx)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add new IC */}
      <div className="ic-editor__add">
        <label>
          Kind
          <select
            value={icKind}
            onChange={(e) => setIcKind(e.currentTarget.value as "node" | "block")}
          >
            <option value="node">Node IC</option>
            <option value="block">Block-state IC</option>
          </select>
        </label>

        {icKind === "node" && (
          <>
            <label>
              Net name
              <input
                type="text"
                value={netDraft}
                list="ic-editor-nets"
                placeholder="net name"
                onChange={(e) => setNetDraft(e.currentTarget.value)}
              />
              <datalist id="ic-editor-nets">
                {netNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label>
              Value
              <input
                type="text"
                value={valueDraft}
                onChange={(e) => setValueDraft(e.currentTarget.value)}
              />
            </label>
            <button type="button" onClick={addNodeIC}>
              Add node IC
            </button>
          </>
        )}

        {icKind === "block" && (
          <>
            <label>
              Block id
              <input
                type="text"
                value={blockDraft}
                list="ic-editor-blocks"
                placeholder="block id"
                onChange={(e) => setBlockDraft(e.currentTarget.value)}
              />
              <datalist id="ic-editor-blocks">
                {blockIds.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
            <label>
              State
              <input
                type="text"
                value={stateDraft}
                placeholder="state name"
                onChange={(e) => setStateDraft(e.currentTarget.value)}
              />
            </label>
            <label>
              Value
              <input
                type="text"
                value={valueDraft}
                onChange={(e) => setValueDraft(e.currentTarget.value)}
              />
            </label>
            <button type="button" onClick={addBlockIC}>
              Add block IC
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ICEditor;
