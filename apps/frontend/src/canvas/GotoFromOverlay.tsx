import { resolveFrom } from "./goto-from-resolver";

type Pos = [number, number];

type OverlayBlock = {
  id: string;
  type: string;
  parentId?: string;
  params?: { tag?: string; visibility?: "local" | "scoped" | "global" };
  position?: Pos;
};

export interface GotoFromOverlayProps {
  selectedGotoId: string;
  model: { blocks: OverlayBlock[] };
}

function center(p?: Pos): Pos {
  if (!p) return [0, 0];
  return [p[0], p[1]];
}

export function GotoFromOverlay({ selectedGotoId, model }: GotoFromOverlayProps) {
  const goto = model.blocks.find((b) => b.id === selectedGotoId);
  if (!goto) return null;

  const fromBlocks = model.blocks.filter((b) => b.type === "routing.from");
  const lines = fromBlocks
    .map((from) => ({ from, match: resolveFrom(from.id, model) }))
    .filter((r) => "id" in r.match && r.match.id === selectedGotoId)
    .map((r) => {
      const [x1, y1] = center(goto.position);
      const [x2, y2] = center(r.from.position);
      return { key: `${selectedGotoId}->${r.from.id}`, x1, y1, x2, y2 };
    });

  return (
    <svg
      role="img"
      aria-label="goto-from-overlay"
      className="goto-from-overlay"
      data-testid="goto-from-overlay"
    >
      {lines.map((l) => (
        <line
          key={l.key}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="currentColor"
          strokeDasharray="4 4"
          data-testid="goto-from-segment"
        />
      ))}
    </svg>
  );
}

export default GotoFromOverlay;
