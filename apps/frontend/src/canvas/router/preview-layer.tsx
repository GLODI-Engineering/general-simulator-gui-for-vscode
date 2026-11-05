interface PreviewLayerProps {
  points: Array<[number, number]>;
}

export function PreviewLayer({ points }: PreviewLayerProps) {
  if (points.length === 0) {
    return null;
  }
  return (
    <svg className="wire-preview" aria-hidden="true">
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="#2563eb"
        strokeDasharray="4 4"
        strokeWidth={3}
      />
    </svg>
  );
}

export default PreviewLayer;
