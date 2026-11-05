import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { AxesLegend } from "./AxesLegend";
import type { WaveformSignal } from "./types";

function resetStore() {
  useWaveformStore.setState({
    figures: new Map(),
    axes: new Map(),
    couplingGroups: new Map(),
    signalCache: new Map(),
    streamingSignals: new Set(),
  });
}

describe("FE-162 AxesLegend", () => {
  afterEach(resetStore);

  it("renders one row per signal with its name and color swatch", () => {
    resetStore();
    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.addSignalToAxes(axesId, "sim-1", "v(a)");
    s.addSignalToAxes(axesId, "sim-1", "v(b)");

    render(<AxesLegend axesId={axesId} />);

    expect(screen.getByText("v(a)")).toBeTruthy();
    expect(screen.getByText("v(b)")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /change color for/i }).length).toBe(2);
  });

  it("clicking a row's remove button removes that signal from the axes", () => {
    resetStore();
    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.addSignalToAxes(axesId, "sim-1", "v(a)");
    s.addSignalToAxes(axesId, "sim-1", "v(b)");

    render(<AxesLegend axesId={axesId} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove v(a)" }));

    const signals = useWaveformStore.getState().axes.get(axesId)?.signals;
    expect(signals?.map((sig) => sig.signalName)).toEqual(["v(b)"]);
  });

  it("changing a row's swatch color updates the signal's color in the store", () => {
    resetStore();
    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.addSignalToAxes(axesId, "sim-1", "v(a)");

    render(<AxesLegend axesId={axesId} />);
    const colorInput = screen.getByLabelText("v(a) color") as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#abcdef" } });

    expect(useWaveformStore.getState().axes.get(axesId)?.signals[0]?.color).toBe("#abcdef");
  });

  it("renders an empty state for an axes with zero signals, without crashing", () => {
    resetStore();
    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");

    render(<AxesLegend axesId={axesId} />);

    expect(screen.getByText(/no signals/i)).toBeTruthy();
  });

  it("shows the unit from signalCache metadata when available", () => {
    resetStore();
    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.addSignalToAxes(axesId, "sim-1", "v(a)");
    const sig: WaveformSignal = {
      simId: "sim-1",
      name: "v(a)",
      analysis: "transient",
      quantity: "voltage",
      unit: "V",
      domain: "time",
      time: new Float64Array([0]),
      values: new Float64Array([0]),
    };
    s.cacheSignal("sim-1", "v(a)", sig);

    render(<AxesLegend axesId={axesId} />);

    expect(screen.getByText("V")).toBeTruthy();
  });
});
