import { translateError } from "../ipc/error-map";
import { getIpcClient, reconnectKernel } from "../ipc/transport";
import type { ExecuteResult, SimulateRequest } from "../ipc/types";
import { detectAnalysisTypeFromNetlist } from "../netlist/generate";
import { toAnalysisPayload } from "../simulation/SimSettings";
import { useGraphStore, useIpcStore, useLibraryStore, useUiStore } from "../store";
import { analysisToPayload } from "../store/model";
import { useSimSettingsStore } from "../store/sim-settings";
import { useWaveformStore } from "../store/waveform";

// If the backend never answers a simulate request at all — hung solver
// process, a crash that doesn't reach the point of sending simulate_result,
// a netlist card the solver can't handle and just stalls on — the request
// promise never settles, and without this the Run button stays on "Stop"
// forever with zero feedback (reported live against an imported netlist
// using an obsolete BSIM2 level=5 .model card). This bounds that: after
// EXECUTE_TIMEOUT_MS with no response, cancel and surface a real error
// instead of hanging indefinitely. Generous on purpose — a legitimate
// large TRAN sweep can genuinely take a while — but "stuck forever" is
// strictly worse than "gives up after 2 minutes with an explanation."
const EXECUTE_TIMEOUT_MS = 120_000;

function executeWithTimeout(payload: SimulateRequest): Promise<ExecuteResult> {
  return new Promise<ExecuteResult>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      getIpcClient().cancel();
      reject(
        new Error(
          `No response from the backend after ${Math.round(EXECUTE_TIMEOUT_MS / 1000)}s — the solver may have hung or crashed without reporting an error (e.g. an unsupported .model card). Cancelled automatically.`,
        ),
      );
    }, EXECUTE_TIMEOUT_MS);
    getIpcClient()
      .execute(payload)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function directNetlistFromMetadata(): string | null {
  const metadata = useGraphStore.getState().document.model.metadata as Record<string, unknown>;
  const netlist = metadata?.spice_netlist;
  return typeof netlist === "string" && netlist.trim().length > 0 ? netlist : null;
}

function hasValidationErrors(): boolean {
  const document = useGraphStore.getState().document;
  return document.model.wires.some((wire) => wire.from.block === wire.to.block);
}

/**
 * Build the analysis portion of the simulate payload.
 *
 * Priority:
 *   1. If `analysisId` is given, look up that analysis in model.simulation.analyses.
 *   2. If model.simulation has analyses, use default_analysis (or first).
 *   3. Fall back to the legacy sim-settings store (v1 compatibility).
 */
function buildAnalysisPayload(analysisId?: string): Record<string, unknown> {
  const simulation = useGraphStore.getState().document.model.simulation;
  const analyses = simulation?.analyses ?? [];

  if (analyses.length > 0) {
    const targetId = analysisId ?? simulation?.default_analysis ?? analyses[0]?.id;
    const analysis = analyses.find((a) => a.id === targetId) ?? analyses[0];
    if (analysis) {
      // analysis is typed with an index signature so fields are ParamValue-wide
      return analysisToPayload(analysis);
    }
  }

  // v1 fallback
  return toAnalysisPayload(useSimSettingsStore.getState().settings);
}

/**
 * FE-154: called at the start of every Run action. If the kernel isn't
 * connected, tells the user what's happening and actually attempts to
 * bring the backend up (or back up) instead of letting the click either
 * hang or fail with a stale/confusing error. Returns false if the caller
 * should bail (reconnectKernel() already reported the specific failure).
 */
async function ensureKernelConnected(): Promise<boolean> {
  const status = useIpcStore.getState().status;
  if (status === "idle" || status === "busy" || status === "connecting") {
    // "connecting" is already handled transparently by getIpcClient()'s
    // proxy — execute() will wait for it, no need to kick off another one.
    return true;
  }

  useIpcStore.getState().appendOutput("Kernel is disconnected — connecting to the kernel sidecar…");
  try {
    await reconnectKernel();
    return true;
  } catch {
    // reconnectKernel() already set status to "error" and appended the
    // specific reason to Output/Problems — nothing more to add here.
    return false;
  }
}

/**
 * Trigger a simulation run using the default analysis (or fall back to v1 settings).
 */
export async function triggerRun(): Promise<void> {
  if (!(await ensureKernelConnected())) return;

  const importedNetlist = useIpcStore.getState().importedNetlist;

  if (!importedNetlist && hasValidationErrors()) {
    useUiStore.getState().focusBottomTab("core.problems");
    useIpcStore
      .getState()
      .setProblems([{ id: "validation-1", severity: "error", message: "Incompatible port types" }]);
    return;
  }

  const model = useGraphStore.getState().document.model;
  const settings = useSimSettingsStore.getState().settings;

  const ipc = useIpcStore.getState();

  let payload: SimulateRequest;

  if (importedNetlist) {
    // File > Import SPICE netlist… — send the file verbatim. Its own
    // .TRAN/.AC/.DC/.control cards govern execution; analysis_type/t_end/
    // t_step below are bookkeeping only (see NgspiceSolver/XyceSolver.solve,
    // which run the netlist text as-is and never rewrite its analysis card).
    // A genuinely different, still-legitimate use case (the user explicitly
    // imported someone else's SPICE deck) — unaffected by the bypass below.
    ipc.appendOutput("── SPICE Netlist ──────────────────────────────────");
    ipc.appendOutput(`(imported netlist, ${importedNetlist.split("\n").length} lines)`);
    for (const line of importedNetlist.split("\n")) {
      ipc.appendOutput(line);
    }
    ipc.appendOutput("");
    ipc.setLastNetlist(importedNetlist);

    const activeSimulator = useLibraryStore.getState().activeSimulator;
    payload = {
      type: "simulate",
      netlist: importedNetlist,
      // For an imported netlist, the UI's analysis-type dropdown reflects
      // whatever it was last set to, not what the netlist's own .tran/.ac/
      // .dc/.noise card actually runs — and the backend tags every signal's
      // manifest metadata (axis labels, Bode-mode detection, units) using
      // this field. Detect it from the netlist itself so an imported AC/DC/
      // NOISE circuit doesn't get mislabeled as a transient result.
      analysis_type: detectAnalysisTypeFromNetlist(importedNetlist),
      t_end: settings.tEnd,
      t_step: settings.tStep,
      ...(activeSimulator !== "all" ? { solver: activeSimulator } : {}),
    };
  } else {
    // The ordinary case: send the raw document and let the backend compile
    // it — gsim-core's own compile registry via
    // simulator.compiler.gsim_py_netlist, not this file's own client-side
    // generateNetlist() (a separate, older, ngspice-only writer that
    // predates the general-simulator-only catalogue and reports every
    // general-simulator block type as "UNSUPPORTED"). triggerRunAnalysis()
    // below already does this the right way; this mirrors it.
    const activeSimulator = useLibraryStore.getState().activeSimulator;
    payload = {
      type: "simulate",
      model,
      analysis_type: settings.analysisType as SimulateRequest["analysis_type"],
      t_end: settings.tEnd,
      t_step: settings.tStep,
      ...(activeSimulator !== "all" ? { solver: activeSimulator } : {}),
    };
  }

  useUiStore.getState().focusBottomTab("core.output");

  try {
    ipc.appendOutput("── Sending to backend… ────────────────────────────");
    useIpcStore.getState().setSimProgress(0, "Starting simulation…");

    const result = await executeWithTimeout(payload);

    useIpcStore.getState().setSimProgress(null);

    if (result.status === "error") {
      const errorMsg = result.chunks?.[0] ?? "Simulation failed";
      useIpcStore.getState().appendOutput(`Backend error: ${errorMsg}`);
      useIpcStore
        .getState()
        .setProblems([{ id: "solver-1", severity: "error", message: errorMsg }]);
      return;
    }

    useIpcStore.getState().setLastManifest(result.manifest);
    useIpcStore.getState().setDcOpTable(result.dc_op_table ?? null);

    for (const chunk of result.chunks ?? []) {
      useIpcStore.getState().appendOutput(chunk);
    }

    useIpcStore
      .getState()
      .appendOutput(`── Simulation complete (${result.manifest.signals.length} signals) ──`);

    _populateWaveformViewer(result.manifest);
    useIpcStore.getState().setActiveEditorTab("core.waveform");
  } catch (error) {
    useIpcStore.getState().setSimProgress(null);
    const translated = translateError(error instanceof Error ? error.message : String(error));
    useIpcStore.getState().appendOutput(`Solver error: ${translated.summary}`);
    // translated.summary is a short, generic category (e.g. a connection
    // failure and a numerical convergence failure both fall through to the
    // same "Solver error" summary) — always show the actual message too, or
    // a transport-level error (kernel sidecar unreachable/disconnected) is
    // indistinguishable from a solver crash in the output.
    if (translated.details && translated.details !== translated.summary) {
      useIpcStore.getState().appendOutput(`  ${translated.details}`);
    }
    useIpcStore.getState().setProblems([
      {
        id: "solver-1",
        severity: translated.severity,
        message:
          translated.details && translated.details !== translated.summary
            ? `${translated.summary}: ${translated.details}`
            : translated.summary,
      },
    ]);
  }
}

/**
 * Trigger a simulation run for a specific analysis id.
 * The Run dropdown in TopBar uses this.
 */
export async function triggerRunAnalysis(analysisId: string): Promise<void> {
  if (!(await ensureKernelConnected())) return;

  if (hasValidationErrors()) {
    useUiStore.getState().focusBottomTab("core.problems");
    useIpcStore
      .getState()
      .setProblems([{ id: "validation-1", severity: "error", message: "Incompatible port types" }]);
    return;
  }

  try {
    const activeSimulator = useLibraryStore.getState().activeSimulator;
    const directNetlist = directNetlistFromMetadata();
    const payload: SimulateRequest = {
      type: "simulate",
      ...(directNetlist
        ? { netlist: directNetlist }
        : { model: useGraphStore.getState().document.model }),
      ...buildAnalysisPayload(analysisId),
      ...(activeSimulator !== "all" ? { solver: activeSimulator } : {}),
    };

    useIpcStore.getState().setSimProgress(0, "Starting simulation…");

    const result = await executeWithTimeout(payload);

    useIpcStore.getState().setSimProgress(null);
    useIpcStore.getState().setLastManifest(result.manifest);
    useIpcStore.getState().setDcOpTable(result.dc_op_table ?? null);
    useIpcStore.getState().setActiveEditorTab("core.waveform");
    for (const chunk of result.chunks ?? []) {
      useIpcStore.getState().appendOutput(chunk);
    }
    _populateWaveformViewer(result.manifest);
  } catch (error) {
    useIpcStore.getState().setSimProgress(null);
    const translated = translateError(error instanceof Error ? error.message : String(error));
    useIpcStore.getState().setProblems([
      {
        id: "solver-1",
        severity: translated.severity,
        message:
          translated.details && translated.details !== translated.summary
            ? `${translated.summary}: ${translated.details}`
            : translated.summary,
      },
    ]);
  }
}

export function triggerCancel(): void {
  getIpcClient().cancel();
}

export const run = triggerRun;
export const cancel = triggerCancel;

// FE-158: cap how many signals share one axes. Dumping every signal from a
// many-signal run onto a single axes (the pre-FE-158 behavior) put up to
// 24 signals — each up to 300k+ points in a real run — on one uPlot
// instance, which combined with the render path fixed in FE-159 was the
// root cause of the reported freeze/crash when the user later viewed that
// figure.
const MAX_SIGNALS_PER_AXES = 8;

/**
 * Best-effort SPICE-convention quantity guess from a signal's name alone
 * (v(...) / i(...) / p(...)), used only to decide which axes a signal
 * lands on. The *authoritative* quantity comes from each signal's own
 * metadata, resolved asynchronously per-signal by fetchSignal() — too late
 * to drive this synchronous layout decision without pre-fetching every
 * signal's data before laying out axes at all, which is a larger change
 * than this fix warrants (see FE-158 in progress.frontend.yaml).
 */
function _quantityHeuristic(signalName: string): string {
  const lower = signalName.toLowerCase();
  if (lower.startsWith("v(")) return "voltage";
  if (lower.startsWith("i(")) return "current";
  if (lower.startsWith("p(")) return "power";
  return "signal";
}

/** Group signal names by heuristic quantity, then chunk each group to MAX_SIGNALS_PER_AXES. */
function _groupSignalsIntoAxes(signalNames: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const name of signalNames) {
    const quantity = _quantityHeuristic(name);
    const bucket = groups.get(quantity);
    if (bucket) {
      bucket.push(name);
    } else {
      groups.set(quantity, [name]);
    }
  }

  const axesGroups: string[][] = [];
  for (const names of groups.values()) {
    for (let i = 0; i < names.length; i += MAX_SIGNALS_PER_AXES) {
      axesGroups.push(names.slice(i, i + MAX_SIGNALS_PER_AXES));
    }
  }
  return axesGroups;
}

/**
 * After a successful simulation, ensure the P22 waveform viewer has a figure
 * ready, then distribute the returned signals across a grid of axes within
 * it — grouped by heuristic quantity and capped at MAX_SIGNALS_PER_AXES per
 * axes (FE-158) — instead of piling every signal onto a single axes.
 *
 * Strategy:
 *   - Use the first existing figure; create one named after the sim if none exists.
 *   - Group signal names (_groupSignalsIntoAxes) and grow/shrink the figure's
 *     grid (row-major) to fit the resulting axes groups.
 *   - Reuse an existing axes already at a given (row, col) when one is still
 *     needed there (keeps axes identity — and any user zoom/coupling state
 *     on it — stable across re-runs with the same layout); create new axes
 *     for grid positions that need one; delete leftover axes from a larger
 *     previous layout that the new one no longer uses.
 *   - Fire-and-forget HTTP fetches for each signal; Axes re-renders when data lands.
 *
 * Runs for *every* completed simulation, including one whose manifest
 * reports zero signals (e.g. an imported netlist with no nodes the backend
 * recognizes as probe-worthy) — skipping the reset in that case used to
 * leave whatever the previous run's axes were still displaying on screen,
 * with nothing indicating those traces were stale instead of belonging to
 * the run that had just completed (FE-146). Only bails out early when there
 * is no existing figure AND nothing to plot — no point creating an empty one.
 */
function _populateWaveformViewer(
  manifest: { sim_id: string; signals: string[] } | null | undefined,
): void {
  if (!manifest) return;

  const store = useWaveformStore.getState();
  const simId = manifest.sim_id;

  // Move the outgoing run into the history before its axes are repopulated.
  // Its samples stay in the cache under their own sim id, so an axes set to
  // show past runs can draw it behind the new one.
  store.beginRun(simId);

  if (store.figures.size === 0 && manifest.signals.length === 0) return;

  // Resolve or create the target figure.
  let figureId: string;
  if (store.figures.size === 0) {
    figureId = store.createFigure("Simulation", 1, 1);
  } else {
    figureId = store.figures.keys().next().value as string;
  }

  const axesGroups = _groupSignalsIntoAxes(manifest.signals);
  // A zero-signal run still needs one (empty) axes so FE-146's stale-trace
  // clearing keeps working — resetAxesSignals([]) below empties it.
  if (axesGroups.length === 0) axesGroups.push([]);

  const cols = Math.max(1, Math.ceil(Math.sqrt(axesGroups.length)));
  const rows = Math.max(1, Math.ceil(axesGroups.length / cols));

  // Snapshot which axes already occupy which (row, col) in this figure
  // before resizing/repopulating, so positions that are still needed in the
  // new layout can reuse their existing axes id instead of being recreated.
  const figureBefore = useWaveformStore.getState().figures.get(figureId);
  const existingByPos = new Map<string, string>();
  if (figureBefore) {
    for (const axesId of figureBefore.axesIds) {
      const ax = useWaveformStore.getState().axes.get(axesId);
      if (ax) existingByPos.set(`${ax.row},${ax.col}`, axesId);
    }
  }

  // Grow/shrink the grid — drops any axes that fall outside the new bounds.
  useWaveformStore.getState().resizeFigure(figureId, rows, cols);

  const usedPositions = new Set<string>();
  axesGroups.forEach((signalNames, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const posKey = `${row},${col}`;
    usedPositions.add(posKey);

    const reusableId = existingByPos.get(posKey);
    const axesId =
      reusableId && useWaveformStore.getState().axes.has(reusableId)
        ? reusableId
        : useWaveformStore.getState().createAxes(figureId, row, col);

    useWaveformStore.getState().resetAxesSignals(
      axesId,
      signalNames.map((signalName) => ({ simId, signalName })),
    );
  });

  // Clean up leftover axes from a previous, larger layout at positions the
  // new layout no longer uses (still within the resized bounds, so
  // resizeFigure didn't already drop them).
  for (const [posKey, axesId] of existingByPos) {
    if (!usedPositions.has(posKey) && useWaveformStore.getState().axes.has(axesId)) {
      useWaveformStore.getState().deleteAxes(axesId);
    }
  }
}
