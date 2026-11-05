/**
 * FE-65: CanvasOverlay — renders dim labels near source ports.
 *
 * Overlaid on top of the canvas. Visibility is toggled via View → Signal
 * dimensions (Ctrl+Alt+D).
 */

import { useMemo } from "react";
import type { PropagateModel } from "./dim-propagate";
import { propagate } from "./dim-propagate";
import type { Probe } from "./probes";
import { getHoverState } from "./wire-draw";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlockPosition {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface CanvasOverlayProps {
  /** Whether dim labels are visible */
  showDimLabels: boolean;
  /** Blocks with their canvas positions */
  blocks: PropagateModel["blocks"] & { position?: [number, number] }[];
  /** All wires in the model */
  wires: PropagateModel["wires"];
  /** Block layout positions keyed by block id */
  blockPositions?: BlockPosition[];
  /** Canvas transform: pan + zoom */
  pan?: { x: number; y: number };
  zoom?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CanvasOverlay renders resolved signal dimensions as small labels near each
 * source port. Acausal (physical-*) wires are excluded.
 *
 * This is a pure display component; it reads wires + blocks, runs the
 * dim propagation pass, and renders SVG labels.
 */
export function CanvasOverlay({ showDimLabels, blocks, wires }: CanvasOverlayProps) {
  const model = useMemo(() => ({ blocks, wires }), [blocks, wires]);
  const dimResult = useMemo(() => propagate(model), [model]);

  if (!showDimLabels || !(dimResult instanceof Map) || dimResult.size === 0) {
    return null;
  }

  // Build a map: wireId -> dim label
  const dimLabels: { wireId: string; label: string; blockId: string; portId: string }[] = [];
  for (const wire of wires) {
    // Skip acausal wires
    if (wire.kind && isAcausalKind(wire.kind)) continue;
    const dim = dimResult.get(wire.id);
    if (!dim) continue;
    dimLabels.push({
      wireId: wire.id,
      label: `[${dim.join("×")}]`,
      blockId: wire.from.block,
      portId: wire.from.port,
    });
  }

  if (dimLabels.length === 0) return null;

  // Render as HTML overlay (positioned labels). In a real canvas integration
  // these would be positioned at the wire source port coords. For now we
  // render a data-testid container that tests can query.
  return (
    <div
      className="canvas-overlay canvas-overlay--dim-labels"
      data-testid="canvas-dim-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      {dimLabels.map(({ wireId, label, blockId, portId }) => (
        <span
          key={wireId}
          className="dim-label"
          data-testid={`dim-label-${wireId}`}
          data-block-id={blockId}
          data-port-id={portId}
          style={{
            position: "absolute",
            fontSize: "10px",
            color: "#6b7280",
            background: "rgba(255,255,255,0.85)",
            borderRadius: "2px",
            padding: "0 2px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cycle highlight overlay
// ---------------------------------------------------------------------------

interface CycleOverlayProps {
  /** Block ids that form a dim-loop cycle */
  cycleBlockIds: string[];
}

/**
 * Highlights blocks involved in a DimLoopError cycle with an amber outline.
 */
export function CycleHighlightOverlay({ cycleBlockIds }: CycleOverlayProps) {
  if (cycleBlockIds.length === 0) return null;

  return (
    <div
      className="canvas-overlay canvas-overlay--cycle-highlight"
      data-testid="canvas-cycle-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
      }}
    >
      {cycleBlockIds.map((blockId) => (
        <div
          key={blockId}
          className="cycle-highlight"
          data-testid={`cycle-highlight-${blockId}`}
          data-block-id={blockId}
          style={{
            position: "absolute",
            border: "2px solid #f59e0b", // amber-400
            borderRadius: "4px",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACAUSAL_KINDS = new Set([
  "physical-electrical",
  "physical-translational",
  "physical-rotational",
  "physical-thermal",
  "electrical",
  "translational",
  "rotational",
  "thermal",
]);

function isAcausalKind(kind: string): boolean {
  return ACAUSAL_KINDS.has(kind);
}

export function wireDrawCursor(): "crosshair" | "not-allowed" {
  const { compat, hover } = getHoverState();
  if (!hover) return "crosshair";
  return compat.ok ? "crosshair" : "not-allowed";
}

// ---------------------------------------------------------------------------
// FE-105: Probe overlay — floating V/I labels, deletable like wires
// ---------------------------------------------------------------------------

interface ProbeOverlayProps {
  probes: Probe[];
  selectedProbeIds?: ReadonlySet<string>;
  onDeleteProbe?: (probeId: string) => void;
  /** Called when a probe label is clicked — toggles selection. */
  onSelectProbe?: (probeId: string) => void;
}

/**
 * Renders probe labels as floating elements positioned at each probe's canvas
 * coordinate. Probes carry their selection state and can be removed (the keymap
 * delete action calls `onDeleteProbe` for each selected probe).
 */
export function ProbeOverlay({
  probes,
  selectedProbeIds,
  onDeleteProbe,
  onSelectProbe,
}: ProbeOverlayProps) {
  if (probes.length === 0) {
    return null;
  }
  return (
    <div
      className="canvas-overlay canvas-overlay--probes"
      data-testid="canvas-probe-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        overflow: "hidden",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {probes.map((probe) => {
        const selected = selectedProbeIds?.has(probe.id) ?? false;
        return (
          <span
            key={probe.id}
            role="button"
            tabIndex={0}
            className={`probe-label probe-label--${probe.kind.toLowerCase()}${selected ? " is-selected" : ""}`}
            data-testid={`probe-label-${probe.id}`}
            data-probe-id={probe.id}
            data-probe-kind={probe.kind}
            onClick={() => onSelectProbe?.(probe.id)}
            onDoubleClick={() => onDeleteProbe?.(probe.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectProbe?.(probe.id);
              if (e.key === "Delete" || e.key === "Backspace") onDeleteProbe?.(probe.id);
            }}
            style={{
              position: "absolute",
              left: `${probe.position[0]}px`,
              top: `${probe.position[1]}px`,
              fontSize: "10px",
              fontFamily: "monospace",
              color: probe.kind === "V" ? "#a06000" : "#1a6a1a",
              background: "rgba(255,255,255,0.9)",
              border: selected ? "1px solid #e08000" : "1px solid #d0d0d0",
              borderRadius: "3px",
              padding: "0 3px",
              pointerEvents: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {probe.label}
          </span>
        );
      })}
    </div>
  );
}
