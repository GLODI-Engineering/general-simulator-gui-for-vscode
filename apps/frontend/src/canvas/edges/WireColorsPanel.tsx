import type { PortKindDomain } from "../../model/types";
import { useWireColorStore } from "../../store/wire-colors";
import { wireColorForDomain } from "./wire-color";

/**
 * The two domains a schematic actually draws wires in day to day — everything else in
 * `PortKindDomain` (thermal/rotational/bus/...) keeps its built-in default for now, the
 * same way `wire-color.ts` itself only assigns colors per domain rather than per wire.
 */
const CUSTOMIZABLE_DOMAINS: Array<{ domain: PortKindDomain; label: string; hint: string }> = [
  {
    domain: "physical-electrical",
    label: "Electrical connections",
    hint: "Resistors, sources, switches — real circuit wiring",
  },
  {
    domain: "signal",
    label: "Signal connections",
    hint: "Control-block signal flow — drawn with an arrowhead toward the reader",
  },
];

interface WireColorsDialogProps {
  onClose: () => void;
}

/** Reuses `.about-dialog` styling (header + body, backdrop-to-close) — same visual
 * language as About/Keyboard Shortcuts, just a different body. */
export function WireColorsDialog({ onClose }: WireColorsDialogProps) {
  const overrides = useWireColorStore((state) => state.overrides);
  const setWireColor = useWireColorStore((state) => state.setWireColor);
  const resetWireColor = useWireColorStore((state) => state.resetWireColor);
  const resetAllWireColors = useWireColorStore((state) => state.resetAllWireColors);

  const hasAnyOverride = Object.keys(overrides).length > 0;

  return (
    <div className="about-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="about-dialog"
        role="dialog"
        aria-label="Wire colors"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="about-dialog__header">
          <strong>Wire Colors</strong>
          <button type="button" aria-label="Close wire colors" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="about-dialog__body wire-colors-dialog__body">
          {CUSTOMIZABLE_DOMAINS.map(({ domain, label, hint }) => {
            const current = overrides[domain] ?? wireColorForDomain(domain);
            const isOverridden = overrides[domain] !== undefined;
            return (
              <div key={domain} className="wire-colors-dialog__row">
                <div className="wire-colors-dialog__row-label">
                  <label htmlFor={`wire-color-${domain}`}>{label}</label>
                  <span className="wire-colors-dialog__hint">{hint}</span>
                </div>
                <input
                  id={`wire-color-${domain}`}
                  type="color"
                  value={current}
                  onChange={(event) => setWireColor(domain, event.target.value)}
                />
                <button
                  type="button"
                  disabled={!isOverridden}
                  title="Reset to default color"
                  onClick={() => resetWireColor(domain)}
                >
                  Reset
                </button>
              </div>
            );
          })}
          <div className="wire-colors-dialog__footer">
            <button type="button" disabled={!hasAnyOverride} onClick={resetAllWireColors}>
              Reset all to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WireColorsDialog;
