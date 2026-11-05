import { useMemo, useState } from "react";
import { createBlockFromMetadata } from "../library/insert";
import type { ParamValue } from "../model/types";
import { Btn, Icon, Sep } from "../shell/ToolbarControls";
import { useGraphStore, useLibraryStore, useToastStore, useUiStore } from "../store";
import { WireColorsDialog } from "./edges/WireColorsPanel";
import { BlockSymbol } from "./nodes/BlockSymbol";

// ── Icons specific to schematic editing ─────────────────────────────────────

const ZoomInIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" x2="16.65" y1="21" y2="16.65" />
    <line x1="11" x2="11" y1="8" y2="14" />
    <line x1="8" x2="14" y1="11" y2="11" />
  </Icon>
);

const ZoomOutIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" x2="16.65" y1="21" y2="16.65" />
    <line x1="8" x2="14" y1="11" y2="11" />
  </Icon>
);

const MaximizeIcon = () => (
  <Icon>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </Icon>
);

const CopyIcon = () => (
  <Icon>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Icon>
);

const ClipboardIcon = () => (
  <Icon>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </Icon>
);

const TrashIcon = () => (
  <Icon>
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>
);

const RotateCwIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </Icon>
);

const RotateCcwIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);

const FlipHIcon = () => (
  <Icon>
    <path d="m3 7 5 5-5 5V7" />
    <path d="m21 7-5 5 5 5V7" />
    <path d="M12 20v2" />
    <path d="M12 14v2" />
    <path d="M12 8v2" />
    <path d="M12 2v2" />
  </Icon>
);

const PaletteIcon = () => (
  <Icon>
    <path d="M12 22a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-6a4 4 0 0 1-4-4 8 8 0 0 1 8-8 9 9 0 0 1 9 9c0 4.5-3.5 8-8 8Z" />
    <circle cx="7.5" cy="10.5" r="1.2" />
    <circle cx="11" cy="6.5" r="1.2" />
    <circle cx="16" cy="8" r="1.2" />
  </Icon>
);

const FlipVIcon = () => (
  <Icon>
    <path d="m17 3-5 5-5-5h10" />
    <path d="m17 21-5-5-5 5h10" />
    <path d="M4 12H2" />
    <path d="M10 12H8" />
    <path d="M16 12h-2" />
    <path d="M22 12h-2" />
  </Icon>
);

// ── Component preview button (BlockSymbol on white background) ────────────────

const SPICE_COMPONENTS = [
  { label: "R", title: "Resistor", type: "physical-electrical.passive.resistor" },
  { label: "C", title: "Capacitor", type: "physical-electrical.passive.capacitor" },
  { label: "L", title: "Inductor", type: "physical-electrical.passive.inductor" },
  { label: "D", title: "Diode", type: "physical-electrical.semiconductor.diode" },
  { label: "Q", title: "BJT NPN", type: "physical-electrical.semiconductor.bjt_npn" },
  { label: "M", title: "MOSFET N-ch", type: "physical-electrical.semiconductor.mosfet_n" },
  { label: "V", title: "Voltage Source", type: "physical-electrical.source.voltage_dc" },
  { label: "I", title: "Current Source", type: "physical-electrical.source.current_dc" },
] as const;

function ComponentBtn({ type, label, title }: { type: string; label: string; title: string }) {
  const metadata = useLibraryStore((state) => state.catalog[type]);

  const defaultParams = useMemo<Record<string, ParamValue>>(() => {
    if (!metadata) return {};
    return Object.fromEntries(
      (metadata.params ?? []).map((p) => [p.name, (p.default ?? null) as ParamValue]),
    );
  }, [metadata]);

  function handleClick() {
    if (!metadata) {
      useToastStore.getState().pushToast(`Component "${label}" not found in catalog.`);
      return;
    }
    const graph = useGraphStore.getState();
    graph.transact(`insert ${label}`, () => {
      graph.addBlock(createBlockFromMetadata(metadata));
    });
  }

  return (
    <button
      type="button"
      className="schematic-toolbar__component"
      title={`Insert ${title}`}
      aria-label={`Insert ${title}`}
      onClick={handleClick}
    >
      {metadata ? (
        <span className="schematic-toolbar__component-preview" aria-hidden="true">
          <BlockSymbol
            metadata={metadata}
            rotation={0}
            mirror="none"
            params={defaultParams}
            showLabels={false}
          />
        </span>
      ) : (
        <span className="schematic-toolbar__component-fallback">{label}</span>
      )}
    </button>
  );
}

// ── Main toolbar ─────────────────────────────────────────────────────────────

export interface SchematicToolbarProps {
  onAction: (actionId: string) => void;
}

/**
 * The Schematic-tab-only *content* of the single toolbar row: zoom,
 * clipboard, component insertion, canvas tools (select/wire/label/text/
 * pan), and block transforms. Rendered inline by shell/MainToolbar.tsx
 * (via shell/ActiveTabToolbar.tsx), appended after the always-visible
 * File/Run controls in the same row — not a separate toolbar of its own —
 * only while the Schematic editor tab is active. See canvas/register.ts.
 */
export function SchematicToolbar({ onAction }: SchematicToolbarProps) {
  const canvasTool = useUiStore((state) => state.canvasTool);
  const annotationTool = useUiStore((state) => state.annotationTool);
  const [wireColorsOpen, setWireColorsOpen] = useState(false);

  return (
    <>
      {/* ── Zoom ── */}
      <Btn title="Zoom In  +" onClick={() => onAction("view.zoom-in")}>
        <ZoomInIcon />
      </Btn>
      <Btn title="Zoom Out  -" onClick={() => onAction("view.zoom-out")}>
        <ZoomOutIcon />
      </Btn>
      <Btn title="Fit diagram to window" label="Fit" onClick={() => onAction("view.fit-diagram")}>
        <MaximizeIcon />
      </Btn>

      <Sep />

      {/* ── Edit ── */}
      <Btn title="Copy  Ctrl+C" onClick={() => onAction("clipboard.copy")}>
        <CopyIcon />
      </Btn>
      <Btn title="Paste  Ctrl+V" onClick={() => onAction("clipboard.paste")}>
        <ClipboardIcon />
      </Btn>
      <Btn title="Delete selection  Del" onClick={() => onAction("selection.delete")}>
        <TrashIcon />
      </Btn>

      <Sep />

      {/* ── Components ── */}
      {SPICE_COMPONENTS.map(({ label, title, type }) => (
        <ComponentBtn key={type} type={type} label={label} title={title} />
      ))}

      <Sep />

      {/* ── Canvas workbench / Transform ── */}
      <div
        className="editor-workbench schematic-toolbar__workbench"
        aria-label="Canvas workbench toolbar"
      >
        <button
          type="button"
          title="Select tool: click and drag blocks to move them. Also the way back to normal interaction after using Wire, Pan, or Text."
          aria-pressed={canvasTool === "select" && annotationTool === null}
          className={canvasTool === "select" && annotationTool === null ? "is-active" : undefined}
          onClick={() => {
            useUiStore.getState().setCanvasTool("select");
            useUiStore.getState().setAnnotationTool(null);
          }}
        >
          Select
        </button>
        <button
          type="button"
          title="Wire tool: draw wires with manual bend points — click empty canvas while drawing to add a waypoint. (Dragging directly from a port to another port works in any mode, but without manual waypoints.)"
          aria-pressed={canvasTool === "wire"}
          className={canvasTool === "wire" ? "is-active" : undefined}
          onClick={() => {
            useUiStore.getState().setCanvasTool("wire");
            useUiStore.getState().setAnnotationTool(null);
          }}
        >
          Wire
        </button>
        <button
          type="button"
          title="Label tool: click a wire to name it — the name is shown next to the wire."
          aria-pressed={canvasTool === "label"}
          className={canvasTool === "label" ? "is-active" : undefined}
          onClick={() => {
            useUiStore.getState().setCanvasTool("label");
            useUiStore.getState().setAnnotationTool(null);
          }}
        >
          Label
        </button>
        <button
          type="button"
          aria-label="Add text annotation"
          title="Add text annotation / SPICE directive"
          aria-pressed={annotationTool === "text"}
          className={annotationTool === "text" ? "is-active" : undefined}
          onClick={() => {
            if (annotationTool === "text") {
              useUiStore.getState().setAnnotationTool(null);
              useUiStore.getState().setCanvasTool("select");
              return;
            }
            useUiStore.getState().setCanvasTool("annotate");
            useUiStore.getState().setAnnotationTool("text");
          }}
        >
          Text
        </button>
        <button
          type="button"
          title="Pan tool: click and drag anywhere — even on top of a block — to pan the view without any risk of accidentally moving a component. Useful in a dense schematic."
          aria-pressed={canvasTool === "pan"}
          className={canvasTool === "pan" ? "is-active" : undefined}
          onClick={() => {
            useUiStore.getState().setCanvasTool("pan");
            useUiStore.getState().setAnnotationTool(null);
          }}
        >
          Pan
        </button>
      </div>
      <Btn
        title="Rotate clockwise  R"
        label="Rotate CW"
        onClick={() => onAction("transform.rotate-cw")}
      >
        <RotateCwIcon />
      </Btn>
      <Btn
        title="Rotate counter-clockwise"
        label="Rotate CCW"
        onClick={() => onAction("transform.rotate-ccw")}
      >
        <RotateCcwIcon />
      </Btn>
      <Btn title="Flip horizontal  X" label="Flip H" onClick={() => onAction("transform.flip")}>
        <FlipHIcon />
      </Btn>
      <Btn title="Flip vertical" label="Flip V" onClick={() => onAction("transform.flip-v")}>
        <FlipVIcon />
      </Btn>

      <Sep />

      {/* ── View ── */}
      <Btn
        title="Wire colors: customize electrical/signal wire colors"
        label="Wire Colors"
        onClick={() => setWireColorsOpen(true)}
      >
        <PaletteIcon />
      </Btn>
      {wireColorsOpen ? <WireColorsDialog onClose={() => setWireColorsOpen(false)} /> : null}
    </>
  );
}

export default SchematicToolbar;
