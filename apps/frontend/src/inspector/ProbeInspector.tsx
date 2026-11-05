type Props = {
  block: { id: string; type: string; params: Record<string, unknown> };
};

export function ProbeInspector({ block }: Props) {
  const width = Number(block.params.width ?? 1);
  const dim = Array.isArray(block.params.dim)
    ? block.params.dim.join(",")
    : String(block.params.dim ?? "1");
  const complexity = String(block.params.complexity ?? "real");

  return (
    <div className="probe-inspector">
      <div className="inspector-field">
        <span className="inspector-label">Width</span>
        <span>{width}</span>
      </div>
      <div className="inspector-field">
        <span className="inspector-label">Dim</span>
        <span>{dim}</span>
      </div>
      <div className="inspector-field">
        <span className="inspector-label">Complexity</span>
        <span>{complexity}</span>
      </div>
    </div>
  );
}

export default ProbeInspector;
