/**
 * FE-148: AnalysisPanel — wrapper around SimulationEditor restricted to the
 * Analyses and Initial Conditions tabs, opened from the "Simulation" button
 * in the toolbar (next to Run), replacing the old inline t_end quick-edit.
 *
 * Notes:
 * - FE-50 tests expect a default TRAN analysis to exist the first time this
 *   panel is opened, so we seed model.simulation.analyses if the model has
 *   none yet (moved here from SimSettingsPanel, which no longer touches
 *   analyses now that it's Solver-only — see FE-148).
 */
import { useEffect } from "react";
import type { Analysis } from "../model/types";
import { useGraphStore } from "../store";
import { SimulationEditor } from "./SimulationEditor";

const DEFAULT_TRAN: Analysis = {
  id: "tran_main",
  type: "TRAN",
  t_end: 0.01,
  t_step: 1e-5,
  uic: false,
};

interface Props {
  onClose?: () => void;
}

export function AnalysisPanel({ onClose }: Props) {
  const analysesLen = useGraphStore(
    (state) => state.document.model.simulation.analyses?.length ?? 0,
  );

  useEffect(() => {
    if (analysesLen > 0) return;

    const graph = useGraphStore.getState();
    graph.transact("seed default analysis", () => {
      const current = graph.document.model.simulation;
      graph.setSimulation({
        ...current,
        analyses: [DEFAULT_TRAN],
        default_analysis: current.default_analysis ?? DEFAULT_TRAN.id,
      });
    });
  }, [analysesLen]);

  return (
    <form
      className="sim-settings-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onClose?.();
      }}
    >
      <SimulationEditor onClose={onClose} tabs={["analyses", "ic"]} />
    </form>
  );
}

export default AnalysisPanel;
