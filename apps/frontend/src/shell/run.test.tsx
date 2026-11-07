/**
 * FE-37: Simulate (Ctrl+T) flow tests
 *
 * Acceptance:
 * - Ctrl+T on an invalid model surfaces the diagnostics panel and does not call IPC.
 * - Ctrl+T on a valid model issues exactly one execute call and renders the resulting waveform.
 * - Ctrl+Shift+T cancels the request.
 */

import { act, render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWaveformStore } from "../store/waveform";
import { RunButton } from "./RunButton";
import { triggerCancel, triggerRun } from "./run";

// ---------------------------------------------------------------------------
// Mock IPC store
// ---------------------------------------------------------------------------
const mockExecute = vi.fn();
const mockCancel = vi.fn();
const mockSetProblems = vi.fn();
const mockSetLastManifest = vi.fn();
const mockSetDcOpTable = vi.fn();
const mockSetActiveEditorTab = vi.fn();
const mockAppendOutput = vi.fn();
const mockSetSimProgress = vi.fn();
const mockSetLastNetlist = vi.fn();

const mockReconnectKernel = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../ipc/transport", () => ({
  getIpcClient: () => ({
    execute: mockExecute,
    cancel: mockCancel,
  }),
  // FE-154: ensureKernelConnected() only calls this when the kernel isn't
  // already connected — most of these tests simulate an already-connected
  // kernel (ipcStatus: "idle" below), so it should never be invoked there.
  reconnectKernel: mockReconnectKernel,
}));

// Mock graph store — valid vs invalid model
let isModelValid = true;
let activeSimulator = "all";
let ipcStatus = "idle";
vi.mock("../store", () => ({
  useGraphStore: {
    getState: () => ({
      document: {
        model: {
          // One block, because Run now refuses an empty sheet rather than
          // sending a netlist with nothing in it. These tests are about the
          // simulate flow, not about emptiness — the empty case has its own
          // tests in run-feedback.test.ts.
          blocks: [{ id: "a" }],
          wires: isModelValid
            ? []
            : [{ from: { block: "a", port: "out" }, to: { block: "a", port: "in" } }],
        },
      },
    }),
  },
  useIpcStore: {
    getState: () => ({
      status: ipcStatus,
      setProblems: mockSetProblems,
      setLastManifest: mockSetLastManifest,
      setDcOpTable: mockSetDcOpTable,
      setActiveEditorTab: mockSetActiveEditorTab,
      appendOutput: mockAppendOutput,
      setSimProgress: mockSetSimProgress,
      setLastNetlist: mockSetLastNetlist,
      importedNetlist: null,
    }),
  },
  useLibraryStore: {
    getState: () => ({
      activeSimulator,
    }),
  },
  useUiStore: {
    getState: () => ({
      focusBottomTab: mockOpenDiagnostics,
    }),
  },
}));

// Mock problems store for diagnostics panel activation
const mockOpenDiagnostics = vi.fn();
describe("FE-37: Simulate flow", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockCancel.mockReset();
    mockOpenDiagnostics.mockReset();
    mockSetProblems.mockReset();
    mockSetLastManifest.mockReset();
    mockSetDcOpTable.mockReset();
    mockSetActiveEditorTab.mockReset();
    mockAppendOutput.mockReset();
    mockReconnectKernel.mockReset().mockResolvedValue(undefined);
    isModelValid = true;
    activeSimulator = "all";
    ipcStatus = "idle";
    useWaveformStore.setState(useWaveformStore.getInitialState());
  });

  it("Ctrl+T on invalid model opens diagnostics and does NOT call IPC execute", async () => {
    isModelValid = false;
    await act(async () => {
      await triggerRun();
    });
    expect(mockOpenDiagnostics).toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("Ctrl+T on valid model calls execute exactly once", async () => {
    isModelValid = true;
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s1", signals: ["y"] } });
    await act(async () => {
      await triggerRun();
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const payload = mockExecute.mock.calls[0][0];
    expect(payload).toMatchObject({ type: "simulate" });
  });

  it("Ctrl+T focuses the waveform editor after a successful run", async () => {
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s1", signals: ["y"] } });

    await act(async () => {
      await triggerRun();
    });

    expect(mockSetActiveEditorTab).toHaveBeenCalledWith("core.waveform");
  });

  it("includes solver in simulate payload when a simulator is selected", async () => {
    activeSimulator = "xyce";
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s1", signals: ["y"] } });

    await act(async () => {
      await triggerRun();
    });

    const payload = mockExecute.mock.calls[0][0];
    expect(payload).toMatchObject({ type: "simulate", solver: "xyce" });
  });

  it("a run whose manifest reports zero signals still clears a previous run's stale traces from the axes", async () => {
    // First run: populates a figure/axes with s1's signals — mirrors what a
    // schematic-based run leaves on screen.
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s1", signals: ["y"] } });
    await act(async () => {
      await triggerRun();
    });
    const figureId = [...useWaveformStore.getState().figures.keys()][0] as string;
    const axesId = useWaveformStore.getState().figures.get(figureId)?.axesIds[0] as string;
    expect(useWaveformStore.getState().axes.get(axesId)?.signals).toEqual([
      expect.objectContaining({ simId: "s1", signalName: "y" }),
    ]);

    // Second run (e.g. an imported netlist the backend reports no probeable
    // nodes for): must not leave s1's traces on screen looking current.
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s2", signals: [] } });
    await act(async () => {
      await triggerRun();
    });
    expect(useWaveformStore.getState().axes.get(axesId)?.signals).toEqual([]);
  });

  it("FE-158: distributes a many-signal run across multiple axes instead of one overloaded axes", async () => {
    const signals = [
      ...Array.from({ length: 20 }, (_, i) => `v(n${i})`),
      ...Array.from({ length: 4 }, (_, i) => `i(r${i})`),
    ];
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s1", signals } });

    await act(async () => {
      await triggerRun();
    });

    const figureId = [...useWaveformStore.getState().figures.keys()][0] as string;
    const figure = useWaveformStore.getState().figures.get(figureId);
    const axesList = (figure?.axesIds ?? []).map((id) => useWaveformStore.getState().axes.get(id));

    // 20 voltages -> 3 axes (8+8+4), 4 currents -> 1 axes: 4 axes total.
    expect(axesList.length).toBe(4);
    for (const ax of axesList) {
      expect(ax?.signals.length).toBeLessThanOrEqual(8);
    }
    // Every signal from the manifest is accounted for exactly once.
    const allPlotted = axesList.flatMap((ax) => ax?.signals.map((s) => s.signalName) ?? []);
    expect(allPlotted.sort()).toEqual([...signals].sort());
  });

  it("FE-158: a small single-quantity run still lands on exactly one axes (no behavior change)", async () => {
    mockExecute.mockResolvedValue({
      manifest: { sim_id: "s1", signals: ["v(a)", "v(b)", "v(c)"] },
    });

    await act(async () => {
      await triggerRun();
    });

    const figureId = [...useWaveformStore.getState().figures.keys()][0] as string;
    const figure = useWaveformStore.getState().figures.get(figureId);
    expect(figure?.axesIds.length).toBe(1);
    const axesId = figure?.axesIds[0] as string;
    expect(
      useWaveformStore
        .getState()
        .axes.get(axesId)
        ?.signals.map((s) => s.signalName),
    ).toEqual(["v(a)", "v(b)", "v(c)"]);
  });

  it("FE-158: re-running with the same single-axes layout reuses the axes id (preserves zoom/coupling state)", async () => {
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s1", signals: ["v(a)"] } });
    await act(async () => {
      await triggerRun();
    });
    const figureId = [...useWaveformStore.getState().figures.keys()][0] as string;
    const firstAxesId = useWaveformStore.getState().figures.get(figureId)?.axesIds[0];

    mockExecute.mockResolvedValue({ manifest: { sim_id: "s2", signals: ["v(a)"] } });
    await act(async () => {
      await triggerRun();
    });
    const secondAxesId = useWaveformStore.getState().figures.get(figureId)?.axesIds[0];

    expect(secondAxesId).toBe(firstAxesId);
  });

  it("a backend that never answers times out instead of leaving the run stuck forever", async () => {
    // Reported live: an imported netlist with an obsolete .model card hung
    // the real backend — execute() never resolved or rejected, and with no
    // client-side timeout the Run button stayed on "Stop" forever with no
    // error, no completion, nothing in Output past "Sending to backend…".
    vi.useFakeTimers();
    try {
      mockExecute.mockReturnValue(new Promise(() => {})); // never settles

      const runPromise = triggerRun();
      // Let the microtasks up to the execute() call flush before advancing
      // the fake clock, so the timeout timer is actually armed.
      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(120_000);
      });
      await act(async () => {
        await runPromise;
      });

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSetSimProgress).toHaveBeenLastCalledWith(null);
      expect(mockSetProblems).toHaveBeenCalledWith([expect.objectContaining({ id: "solver-1" })]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Ctrl+Shift+T cancels the in-flight request", async () => {
    isModelValid = true;
    let resolveExecute!: (v: unknown) => void;
    mockExecute.mockReturnValue(
      new Promise((r) => {
        resolveExecute = r;
      }),
    );

    await act(async () => {
      void triggerRun();
      triggerCancel();
    });
    expect(mockCancel).toHaveBeenCalled();
    resolveExecute(null);
  });

  it("FE-154: Run while disconnected tells the user and reconnects before executing", async () => {
    ipcStatus = "disconnected";
    mockExecute.mockResolvedValue({ manifest: { sim_id: "s1", signals: ["y"] } });

    await act(async () => {
      await triggerRun();
    });

    expect(mockAppendOutput).toHaveBeenCalledWith(
      expect.stringMatching(/disconnected.*connecting/i),
    );
    expect(mockReconnectKernel).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("FE-154: Run while disconnected does not execute if reconnecting fails", async () => {
    ipcStatus = "error";
    mockReconnectKernel.mockRejectedValue(new Error("kernel sidecar failed to start"));

    await act(async () => {
      await triggerRun();
    });

    expect(mockReconnectKernel).toHaveBeenCalledTimes(1);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("FE-37: RunButton", () => {
  it("reflects idle status with run label", () => {
    render(React.createElement(RunButton, { status: "idle", onRun: () => {}, onCancel: () => {} }));
    expect(document.body.textContent).toMatch(/run|simulate/i);
  });

  it("reflects busy status with stop/cancel label", () => {
    render(React.createElement(RunButton, { status: "busy", onRun: () => {}, onCancel: () => {} }));
    expect(document.body.textContent).toMatch(/stop|cancel/i);
  });

  it("reflects error status visually", () => {
    const { container } = render(
      React.createElement(RunButton, { status: "error", onRun: () => {}, onCancel: () => {} }),
    );
    // Presence of an error indicator (class, aria-label, or text)
    expect(
      container.querySelector("[data-status='error'], .error, [aria-label*='error' i]") ||
        document.body.textContent?.match(/error/i),
    ).toBeTruthy();
  });
});
