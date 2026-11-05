type Props = {
  block: { id: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
};

export function GotoInspector({ block, onChange }: Props) {
  const tag = String(block.params.tag ?? "");
  const visibility = String(block.params.visibility ?? "local");

  return (
    <div className="goto-inspector">
      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`goto-tag-${block.id}`}>
          Tag
        </label>
        <input
          id={`goto-tag-${block.id}`}
          type="text"
          className="inspector-input"
          defaultValue={tag}
          onBlur={(ev) => onChange?.({ ...block.params, tag: ev.currentTarget.value })}
        />
      </div>
      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`goto-vis-${block.id}`}>
          Visibility
        </label>
        <select
          id={`goto-vis-${block.id}`}
          className="inspector-select"
          defaultValue={visibility}
          onChange={(ev) =>
            onChange?.({
              ...block.params,
              visibility: ev.currentTarget.value,
            })
          }
        >
          <option value="local">local</option>
          <option value="scoped">scoped</option>
          <option value="global">global</option>
        </select>
      </div>
    </div>
  );
}

export default GotoInspector;
