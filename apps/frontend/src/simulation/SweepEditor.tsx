/**
 * FE-61: SweepEditor — add/edit parameter sweeps attached to an analysis.
 * Supports three sweep kinds: linear, decade, and points.
 */
import { useState } from "react";

type SweepKind = "linear" | "decade" | "points";

export interface SweepDef {
  kind: SweepKind;
  start?: number;
  stop?: number;
  n?: number;
  points?: number[];
}

interface Props {
  sweep?: { kind: string; start?: number; stop?: number; n?: number; points?: number[] };
  onChange?: (sweep: SweepDef) => void;
}

function generatePoints(
  kind: "linear" | "decade",
  start: number,
  stop: number,
  n: number,
): number[] {
  if (n <= 1) return [start];
  if (kind === "linear") {
    const step = (stop - start) / (n - 1);
    return Array.from({ length: n }, (_, i) => start + i * step);
  }
  // decade (log-space)
  if (start <= 0 || stop <= 0) return [];
  const logStart = Math.log10(start);
  const logStop = Math.log10(stop);
  const step = (logStop - logStart) / (n - 1);
  return Array.from({ length: n }, (_, i) => 10 ** (logStart + i * step));
}

export function SweepEditor({ sweep, onChange }: Props) {
  const [kind, setKind] = useState<SweepKind>((sweep?.kind as SweepKind) ?? "linear");
  const [start, setStart] = useState<number>(sweep?.start ?? 0);
  const [stop, setStop] = useState<number>(sweep?.stop ?? 1);
  const [n, setN] = useState<number>(sweep?.n ?? 10);
  const [rawPoints, setRawPoints] = useState<string>(sweep?.points?.join(", ") ?? "");

  const handleApply = () => {
    if (kind === "points") {
      const pts = rawPoints
        .split(/[\s,]+/)
        .map(Number)
        .filter((v) => Number.isFinite(v));
      onChange?.({ kind: "points", points: pts });
    } else {
      const pts = generatePoints(kind, start, stop, n);
      onChange?.({ kind, start, stop, n, points: pts });
    }
  };

  return (
    <div className="sweep-editor">
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.currentTarget.value as SweepKind)}>
          <option value="linear">Linear</option>
          <option value="decade">Decade</option>
          <option value="points">Points</option>
        </select>
      </label>

      {(kind === "linear" || kind === "decade") && (
        <>
          <label>
            Start
            <input
              type="number"
              value={start}
              onChange={(e) => setStart(Number(e.currentTarget.value))}
            />
          </label>
          <label>
            Stop
            <input
              type="number"
              value={stop}
              onChange={(e) => setStop(Number(e.currentTarget.value))}
            />
          </label>
          <label>
            N
            <input type="number" value={n} onChange={(e) => setN(Number(e.currentTarget.value))} />
          </label>
        </>
      )}

      {kind === "points" && (
        <label>
          Points (comma-separated)
          <input
            type="text"
            value={rawPoints}
            onChange={(e) => setRawPoints(e.currentTarget.value)}
          />
        </label>
      )}

      <button type="button" onClick={handleApply}>
        Apply
      </button>
    </div>
  );
}

export default SweepEditor;
