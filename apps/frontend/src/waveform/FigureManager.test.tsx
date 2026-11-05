import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { FigureManager } from "./FigureManager";

describe("FE-111 FigureManager", () => {
  it("creates a new figure from toolbar", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    render(<FigureManager />);
    fireEvent.click(screen.getByRole("button", { name: /new figure/i }));

    expect(useWaveformStore.getState().figures.size).toBe(1);
  });

  it("auto-selects a figure created after mount (e.g. by Run), instead of staying on the empty state forever", () => {
    // Reproduces the reported bug: FigureManager mounts while no figure
    // exists yet (typical — before the user has run anything), then a run
    // completes and _populateWaveformViewer() creates the "Simulation"
    // figure directly via the store, the way it always has. Before this
    // fix, activeFigureId was a one-shot lazy useState initializer that ran
    // before the figure existed and never got re-evaluated, so the newly
    // created figure never became active on its own — GridLayout (and every
    // uPlot instance under it) only ever mounted on the user's *next*
    // manual click of that tab.
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    render(<FigureManager />);
    expect(screen.getByText(/no figures/i)).toBeTruthy();

    act(() => {
      useWaveformStore.getState().createFigure("Simulation", 1, 1);
    });

    expect(screen.queryByText(/no figures/i)).toBeNull();
    expect(screen.getByRole("tab", { name: "Simulation" })).toBeTruthy();
  });

  it("falls back to another figure if the active one is deleted out from under it directly via the store", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
    const s = useWaveformStore.getState();
    const figA = s.createFigure("A", 1, 1);
    s.createFigure("B", 1, 1);

    render(<FigureManager />);
    expect(screen.getByRole("tab", { name: "A" })).toBeTruthy();

    act(() => {
      useWaveformStore.getState().deleteFigure(figA);
    });

    expect(screen.getByRole("tab", { name: "B" })).toBeTruthy();
    expect(screen.queryByText(/no figures/i)).toBeNull();
  });
});
