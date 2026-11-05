import packageJson from "../../package.json";
import { keyBindings } from "../canvas/keymap";

const APP_VERSION = (packageJson as { version: string }).version;

interface DialogProps {
  onClose: () => void;
}

const CONTEXT_LABELS: Record<string, string> = {
  global: "Global",
  canvas: "Canvas",
  selection: "Selection",
  "connected-block": "Connected block",
  "drawing-wire": "Drawing wire",
  "in-place-edit": "In-place edit",
  modal: "Modal",
};

export function AboutDialog({ onClose }: DialogProps) {
  return (
    <div className="about-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="about-dialog"
        role="dialog"
        aria-label="About General Simulator"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="about-dialog__header">
          <strong>General Simulator</strong>
          <button type="button" aria-label="Close about dialog" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="about-dialog__body">
          <p>Version {APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}

export function KeyboardShortcutsDialog({ onClose }: DialogProps) {
  const sorted = [...keyBindings].sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div className="about-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="about-dialog about-dialog--shortcuts"
        role="dialog"
        aria-label="Keyboard Shortcuts"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="about-dialog__header">
          <strong>Keyboard Shortcuts</strong>
          <button type="button" aria-label="Close keyboard shortcuts dialog" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="about-dialog__body">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Shortcut</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((binding) => (
                <tr key={binding.id}>
                  <td>{binding.label}</td>
                  <td>
                    {binding.chord ? (
                      <kbd>{binding.chord}</kbd>
                    ) : (
                      <span className="about-dialog__no-chord">mouse only</span>
                    )}
                  </td>
                  <td>{binding.contexts.map((ctx) => CONTEXT_LABELS[ctx] ?? ctx).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
