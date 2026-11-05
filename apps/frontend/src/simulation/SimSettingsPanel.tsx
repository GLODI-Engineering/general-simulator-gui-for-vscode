/**
 * FE-61: SimSettingsPanel — wrapper around SimulationEditor, restricted to
 * Solver options (FE-148: Analyses and Initial Conditions moved to
 * AnalysisPanel, opened from the toolbar's "Simulation" button instead).
 */
import { SimulationEditor } from "./SimulationEditor";

interface Props {
  onClose?: () => void;
}

export function SimSettingsPanel({ onClose }: Props) {
  return (
    <form
      className="sim-settings-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onClose?.();
      }}
    >
      <SimulationEditor onClose={onClose} tabs={["solver"]} />
    </form>
  );
}

export default SimSettingsPanel;
