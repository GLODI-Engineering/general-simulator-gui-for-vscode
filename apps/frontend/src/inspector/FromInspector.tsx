type Props = {
  block: { id: string; params: Record<string, unknown> };
  onChange?: (params: Record<string, unknown>) => void;
};

export function FromInspector({ block, onChange }: Props) {
  const tag = String(block.params.tag ?? "");
  return (
    <div className="from-inspector">
      <div className="inspector-field">
        <label className="inspector-label" htmlFor={`from-tag-${block.id}`}>
          Tag
        </label>
        <input
          id={`from-tag-${block.id}`}
          type="text"
          className="inspector-input"
          defaultValue={tag}
          onBlur={(ev) => onChange?.({ ...block.params, tag: ev.currentTarget.value })}
        />
      </div>
    </div>
  );
}

export default FromInspector;
