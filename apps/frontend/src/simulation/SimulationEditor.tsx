/**
 * FE-61: SimulationEditor — v2 simulation editor with 3 sub-editors.
 *
 * Tabs: Analyses | Solver | Initial Conditions
 *
 * `tabs` restricts which sub-editors are shown (and which is active
 * first) — FE-148 splits this one editor across two different entry
 * points: a "Simulation" button (Analyses + Initial Conditions) and the
 * Settings dialog (Solver only). The tab bar is hidden when there's
 * nothing to switch between.
 *
 * Connected to the Zustand graph store via model.simulation (spec §13).
 */
import { useCallback, useState } from "react";
import type { Analysis, Simulation } from "../model/types";
import { useGraphStore } from "../store";
import { resolveModelParams } from "../store/model";
import { AnalysisRow } from "./AnalysisRow";
import { ICEditor } from "./ICEditor";
import { SolverOptionsEditor } from "./SolverOptionsEditor";
import type { SolverOptions } from "./SolverOptionsEditor";

type TabId = "analyses" | "solver" | "ic";

const ALL_TABS: Array<{ id: TabId; label: string }> = [
  { id: "analyses", label: "Analyses" },
  { id: "solver", label: "Solver" },
  { id: "ic", label: "Initial Conditions" },
];

let _idCounter = 0;
function genId(): string {
  _idCounter += 1;
  return `a_${Date.now().toString(36)}_${_idCounter}`;
}

interface Props {
  onClose?: () => void;
  /** Which sub-editors to show, in order. Defaults to all three. */
  tabs?: TabId[];
}

export function SimulationEditor({ onClose, tabs = ["analyses", "solver", "ic"] }: Props) {
  const document = useGraphStore((state) => state.document);
  const simulation: Simulation = document.model.simulation;

  const analyses: Analysis[] = simulation.analyses ?? [];

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0] ?? "analyses");

  const resolvedParams = resolveModelParams(document.model.params);
  const netNames = document.model.nets.map((n) => n.name);
  const blockIds = document.model.blocks.map((b) => b.id);

  const solverOptions = (simulation.solver_options ?? {}) as SolverOptions;
  const ics = (simulation.initial_conditions ?? []) as Array<Record<string, unknown>>;

  /** Write a partial simulation patch to the store. */
  const updateSimulation = useCallback((patch: Partial<Simulation>) => {
    const graph = useGraphStore.getState();
    const currentSim = graph.document.model.simulation;
    graph.transact("update simulation", () => {
      graph.setSimulation({ ...currentSim, ...patch });
    });
  }, []);

  const handleAnalysisChange = (idx: number, patch: Record<string, unknown>) => {
    const updated = analyses.map((a, i) =>
      i === idx ? ({ ...a, ...(patch as Partial<Analysis>) } as Analysis) : a,
    );
    updateSimulation({ analyses: updated });
  };

  const handleAddAnalysis = () => {
    const newAnalysis: Analysis = {
      id: genId(),
      type: "TRAN",
      t_end: 0.01,
      t_step: 1e-5,
      uic: false,
    };

    const updated = [...analyses, newAnalysis];
    updateSimulation({
      analyses: updated,
      default_analysis: simulation.default_analysis ?? updated[0]?.id ?? null,
    });
  };

  const handleDeleteAnalysis = (idx: number) => {
    const updated = analyses.filter((_, i) => i !== idx);
    updateSimulation({
      analyses: updated,
      default_analysis: updated[0]?.id ?? null,
    });
  };

  const visibleTabs = ALL_TABS.filter((t) => tabs.includes(t.id));

  return (
    <div className="simulation-editor">
      <div className="simulation-editor__header">
        <h2>Simulation Editor</h2>
        {onClose && (
          <button type="button" aria-label="Close simulation editor" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {/* Tab bar — hidden when there's only one sub-editor to show */}
      {visibleTabs.length > 1 && (
        <div className="simulation-editor__tabs" role="tablist">
          {visibleTabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={activeTab === id ? "active" : undefined}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="simulation-editor__content">
        {activeTab === "analyses" && (
          <div className="simulation-editor__analyses">
            <ul>
              {analyses.map((a, idx) => (
                <AnalysisRow
                  key={a.id}
                  analysis={a as { id: string; type: string; [k: string]: unknown }}
                  params={resolvedParams}
                  blockIds={blockIds}
                  onChange={(patch) => handleAnalysisChange(idx, patch)}
                  onDelete={() => handleDeleteAnalysis(idx)}
                />
              ))}
            </ul>

            <button type="button" aria-label="Add analysis" onClick={handleAddAnalysis}>
              Add analysis
            </button>
          </div>
        )}

        {activeTab === "solver" && (
          <SolverOptionsEditor
            options={solverOptions}
            onChange={(patch) =>
              updateSimulation({ solver_options: { ...solverOptions, ...patch } })
            }
          />
        )}

        {activeTab === "ic" && (
          <ICEditor
            ics={ics}
            netNames={netNames}
            blockIds={blockIds}
            onChange={(updatedIcs) =>
              updateSimulation({
                initial_conditions: updatedIcs as Array<
                  Record<string, import("../model/types").ParamValue>
                >,
              })
            }
          />
        )}
      </div>

      {onClose && (
        <div className="simulation-editor__footer">
          <button type="button" aria-label="Apply" onClick={onClose}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

export default SimulationEditor;
