import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { MeasurementsBar } from "./MeasurementsBar";
import { measureIntegral } from "./measurements";
import type { WaveformSignal } from "./types";

/** A 1 V amplitude sine at 1 kHz, exactly two periods. */
function sine(name: string): WaveformSignal {
  const n = 2000;
  const time = new Float64Array(n);
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    time[i] = (i / n) * 2e-3;
    values[i] = Math.sin(2 * Math.PI * 1000 * time[i]);
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
  store.cacheSignal("run-1", "V(a)", sine("V(a)"));
  const figureId = useWaveformStore.getState().createFigure("Results", 1, 1);
  const axesId = useWaveformStore.getState().createAxes(figureId, 0, 0);
  useWaveformStore.getState().addSignalToAxes(axesId, "run-1", "V(a)");
  return axesId;
}

beforeEach(seed);

describe("MeasurementsBar", () => {
  /**
   * The previous bar — and the whole measurement library behind it — was
   * never mounted anywhere in the app. Everything below is a check that it
   * is now reachable and correct, not merely present.
   */
  /**
   * Nothing is measured until a trace is picked.
   *
   * Ticking a measurement used to compute it for every trace on the axes at
   * once — work nobody asked for, and on an axes carrying eight traces it
   * buried the one number being looked for in seven others.
   */
  it("measures nothing until a signal is chosen", () => {
    render(<MeasurementsBar axesId={seed()} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/Tick a signal/)).toBeTruthy();
  });

  it("offers every signal on the axes as a chip", () => {
    const axesId = seed();
    useWaveformStore.getState().cacheSignal("run-1", "V(b)", sine("V(b)"));
    useWaveformStore.getState().addSignalToAxes(axesId, "run-1", "V(b)");
    render(<MeasurementsBar axesId={axesId} />);
    const group = screen.getByRole("group", { name: "Signals to measure" });
    expect(within(group).getByLabelText("V(a)")).toBeTruthy();
    expect(within(group).getByLabelText("V(b)")).toBeTruthy();
  });

  it("shows a column per measurement and a row for each chosen trace", async () => {
    const axesId = seed();
    useWaveformStore.getState().setAxesMeasuredSignals(axesId, ["run-1::V(a)"]);
    render(<MeasurementsBar axesId={axesId} />);
    expect(screen.getByRole("columnheader", { name: "RMS" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Mean" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Peak-to-peak" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "V(a)" })).toBeTruthy();
  });

  it("leaves an unticked trace out of the table", () => {
    const axesId = seed();
    useWaveformStore.getState().cacheSignal("run-1", "V(b)", sine("V(b)"));
    useWaveformStore.getState().addSignalToAxes(axesId, "run-1", "V(b)");
    useWaveformStore.getState().setAxesMeasuredSignals(axesId, ["run-1::V(a)"]);
    render(<MeasurementsBar axesId={axesId} />);
    expect(screen.getByRole("rowheader", { name: "V(a)" })).toBeTruthy();
    expect(screen.queryByRole("rowheader", { name: "V(b)" })).toBeNull();
  });

  it("reports the RMS of a sine as its amplitude over root two", async () => {
    const axesId = seed();
    useWaveformStore.getState().setAxesMeasuredSignals(axesId, ["run-1::V(a)"]);
    render(<MeasurementsBar axesId={axesId} />);
    await waitFor(() => {
      expect(screen.getByText(/707(\.\d+)? mV/)).toBeTruthy();
    });
  });

  /**
   * The whole library is on the bar now, not behind a menu. The dropdown
   * held about one and a half entries before the bar clipped it, so
   * choosing from it meant scrolling a list through a slot.
   */
  it("puts every measurement on the bar, with the defaults already on", () => {
    render(<MeasurementsBar axesId={seed()} />);
    const group = screen.getByRole("group", { name: "Measurements" });
    const duty = within(group).getByLabelText("Duty cycle") as HTMLInputElement;
    const rms = within(group).getByLabelText("RMS") as HTMLInputElement;
    expect(duty.checked).toBe(false);
    expect(rms.checked).toBe(true);
  });

  it("will not measure between cursors until both are placed", () => {
    render(<MeasurementsBar axesId={seed()} />);
    const button = screen.getByRole("button", { name: "A–B" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("enables the cursor window once A and B exist", () => {
    const axesId = seed();
    useWaveformStore.getState().setAxesCursor(axesId, "A", 0.5e-3);
    useWaveformStore.getState().setAxesCursor(axesId, "B", 1.5e-3);
    render(<MeasurementsBar axesId={axesId} />);
    expect((screen.getByRole("button", { name: "A–B" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders nothing for an axes with no traces", () => {
    const figureId = useWaveformStore.getState().createFigure("Empty", 1, 1);
    const axesId = useWaveformStore.getState().createAxes(figureId, 0, 0);
    const { container } = render(<MeasurementsBar axesId={axesId} />);
    expect(container.querySelector(".measurements-bar")).toBeNull();
  });
});

describe("measureIntegral", () => {
  it("gives the area under a trace, matching the engine's own `integ`", () => {
    // A ramp from 0 to 1 over 1 s has area 1/2.
    const n = 1001;
    const time = new Float64Array(n);
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      time[i] = i / (n - 1);
      values[i] = time[i] as number;
    }
    expect(measureIntegral(time, values).value).toBeCloseTo(0.5, 9);
  });

  it("integrates only the window it is given", () => {
    const n = 1001;
    const time = new Float64Array(n);
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      time[i] = i / (n - 1);
      values[i] = 1;
    }
    expect(measureIntegral(time, values, 0.25, 0.75).value).toBeCloseTo(0.5, 6);
  });

  it("has nothing to say about a single sample", () => {
    expect(
      Number.isNaN(measureIntegral(Float64Array.from([0]), Float64Array.from([1])).value),
    ).toBe(true);
  });
});
