import { render, screen, waitFor } from "@testing-library/react";
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
  it("shows a column per measurement and a row per trace", async () => {
    render(<MeasurementsBar axesId={seed()} />);
    expect(screen.getByRole("columnheader", { name: "RMS" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Mean" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Peak-to-peak" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "V(a)" })).toBeTruthy();
  });

  it("reports the RMS of a sine as its amplitude over root two", async () => {
    render(<MeasurementsBar axesId={seed()} />);
    await waitFor(() => {
      expect(screen.getByText(/707(\.\d+)? mV/)).toBeTruthy();
    });
  });

  it("offers the rest of the library in a menu rather than on the bar", async () => {
    render(<MeasurementsBar axesId={seed()} />);
    // Shown by default: the three a converter waveform is read for.
    expect(screen.queryByRole("columnheader", { name: "Duty cycle" })).toBeNull();
    // Available: everything.
    screen.getByRole("button", { name: /Measurements/ }).click();
    await waitFor(() => {
      expect(screen.getByLabelText?.("Duty cycle") ?? screen.getByText("Duty cycle")).toBeTruthy();
    });
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
