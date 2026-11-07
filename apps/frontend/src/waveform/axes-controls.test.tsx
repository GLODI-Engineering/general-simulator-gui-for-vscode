import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { Axes } from "./Axes";
import type { WaveformSignal } from "./types";

function ramp(name: string): WaveformSignal {
  const n = 64;
  const time = new Float64Array(n);
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    time[i] = i / n;
    values[i] = i;
  }
  return {
    simId: "run-1",
    name,
    analysis: "tran",
    quantity: "voltage",
    unit: "V",
    domain: "time",
    time,
    values,
  };
}

function seed(): string {
  useWaveformStore.setState({
    figures: new Map(),
    axes: new Map(),
    couplingGroups: new Map(),
    signalCache: new Map(),
    streamingSignals: new Set(),
    activeAxesId: null,
  });
  const store = useWaveformStore.getState();
  store.cacheSignal("run-1", "V(a)", ramp("V(a)"));
  const figureId = useWaveformStore.getState().createFigure("F", 1, 1);
  const axesId = useWaveformStore.getState().createAxes(figureId, 0, 0);
  useWaveformStore.getState().addSignalToAxes(axesId, "run-1", "V(a)");
  return axesId;
}

beforeEach(seed);

/**
 * An axes carried one control — maximize. Getting a plot out of the way
 * meant deleting it or making it fill the figure, and fitting one plot in a
 * figure of six meant selecting it on the main toolbar first.
 */
describe("axes header controls", () => {
  it("offers fit, minimize and close beside maximize", () => {
    render(<Axes axesId={seed()} />);
    expect(screen.getByLabelText("Fit time axis to data")).toBeTruthy();
    expect(screen.getByLabelText("Fit value axis to data")).toBeTruthy();
    expect(screen.getByLabelText("Minimize axes")).toBeTruthy();
    expect(screen.getByLabelText("Close axes")).toBeTruthy();
    expect(screen.getByLabelText("Maximize axes")).toBeTruthy();
  });

  it("fitting horizontally sets the x-range to the data extent", () => {
    const axesId = seed();
    render(<Axes axesId={axesId} />);
    (screen.getByLabelText("Fit time axis to data") as HTMLButtonElement).click();
    const entry = useWaveformStore.getState().axes.get(axesId)!;
    expect(entry.xMin).toBeCloseTo(0, 6);
    expect(entry.xMax).toBeGreaterThan(0.9);
  });

  it("fitting vertically sets the y-range without touching x", () => {
    const axesId = seed();
    useWaveformStore.getState().setAxesZoom(axesId, 0.25, 0.75);
    render(<Axes axesId={axesId} />);
    (screen.getByLabelText("Fit value axis to data") as HTMLButtonElement).click();
    const entry = useWaveformStore.getState().axes.get(axesId)!;
    expect(entry.xMin).toBeCloseTo(0.25, 6);
    expect(entry.xMax).toBeCloseTo(0.75, 6);
    expect(entry.yMin).toBeDefined();
    expect(entry.yMax).toBeGreaterThan(entry.yMin!);
  });

  /** Minimizing keeps the axes in the figure; closing removes it. */
  it("minimizing folds the axes without removing it", () => {
    const axesId = seed();
    render(<Axes axesId={axesId} />);
    (screen.getByLabelText("Minimize axes") as HTMLButtonElement).click();
    expect(useWaveformStore.getState().axes.get(axesId)?.collapsed).toBe(true);
    expect(useWaveformStore.getState().axes.has(axesId)).toBe(true);
  });

  it("closing removes the axes from the figure", () => {
    const axesId = seed();
    render(<Axes axesId={axesId} />);
    (screen.getByLabelText("Close axes") as HTMLButtonElement).click();
    expect(useWaveformStore.getState().axes.has(axesId)).toBe(false);
  });
});
