type Props = {
  block: { id: string; type: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
};

function parseDim(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => !Number.isNaN(n));
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
  }
  return [1];
}

export function SignalSpecInspector({ block, onChange }: Props) {
  const dim = parseDim(block.params.dim);
  const complexity = String(block.params.complexity ?? "real");

  return (
    <div className="signal-spec-inspector">
      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`sigspec-dim-${block.id}`}>
          Dim
        </label>
        <input
          id={`sigspec-dim-${block.id}`}
          aria-label="dim"
          type="text"
          className="inspector-input"
          defaultValue={dim.join(",")}
          onBlur={(ev) => {
            const next = parseDim(ev.currentTarget.value);
            onChange?.({ ...block.params, dim: next });
          }}
        />
      </div>
      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`sigspec-cx-${block.id}`}>
          Complexity
        </label>
        <select
          id={`sigspec-cx-${block.id}`}
          className="inspector-select"
          defaultValue={complexity}
          onChange={(ev) => onChange?.({ ...block.params, complexity: ev.currentTarget.value })}
        >
          <option value="real">real</option>
          <option value="complex">complex</option>
        </select>
      </div>
    </div>
  );
}

export default SignalSpecInspector;
