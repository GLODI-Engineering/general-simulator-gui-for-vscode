import { useEffect, useRef, useState } from "react";

export interface GainControlProps {
  /** Current display gain; undefined or 1 means none. */
  gain: number | undefined;
  signalName: string;
  editing: boolean;
  onEdit: () => void;
  onCommit: (gain: number) => void;
  onCancel: () => void;
}

/** "×10", "×0.5", "×1e3" — short, and unambiguous about what it multiplies. */
export function formatGain(gain: number): string {
  const magnitude = Math.abs(gain);
  if (magnitude !== 0 && (magnitude >= 1e4 || magnitude < 1e-3)) {
    return `×${gain.toExponential(0).replace("e+", "e")}`;
  }
  return `×${Number(gain.toPrecision(4))}`;
}

/**
 * The per-trace display gain, shown in the legend.
 *
 * It exists because a 2 A current next to a 48 V rail is a flat line: at the
 * voltage's scale the current's *shape* — the ripple, the slope, the
 * transient — is below one pixel. Scaling it is standard scope practice, and
 * the scope always says so on the trace.
 *
 * Which is the rule this component enforces: a scaled trace shows "×10"
 * permanently, never on hover only. A plot that can quietly misreport a
 * measured value by a factor of ten is worse than one that cannot scale at
 * all. Gain is display-only — measurements, cursors and every export read
 * the real samples.
 */
export function GainControl({
  gain,
  signalName,
  editing,
  onEdit,
  onCommit,
  onCancel,
}: GainControlProps) {
  const [draft, setDraft] = useState(String(gain ?? 1));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(gain ?? 1));
      inputRef.current?.select();
    }
  }, [editing, gain]);

  function commit() {
    const parsed = Number.parseFloat(draft);
    onCommit(Number.isFinite(parsed) && parsed !== 0 ? parsed : 1);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="axes-legend__gain-input"
        aria-label={`Display gain for ${signalName}`}
        defaultValue={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
      />
    );
  }

  const scaled = gain !== undefined && gain !== 1;
  return (
    <button
      type="button"
      className={`axes-legend__gain${scaled ? " axes-legend__gain--set" : ""}`}
      title={
        scaled
          ? `${signalName} is drawn ${formatGain(gain)}. Measurements and exports use its real values.`
          : `Scale ${signalName} for display only`
      }
      aria-label={`Display gain for ${signalName}`}
      onClick={onEdit}
    >
      {scaled ? formatGain(gain) : "×1"}
    </button>
  );
}

export default GainControl;
