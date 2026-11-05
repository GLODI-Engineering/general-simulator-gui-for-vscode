import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { Axes } from "./Axes";

function fakeDataTransfer(entries: Record<string, string>) {
  return {
    types: Object.keys(entries),
    getData: (key: string) => entries[key] ?? "",
    setData: () => {},
    dropEffect: "",
  };
}

describe("Axes — loading-state render loop regression", () => {
  afterEach(() => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
  });

  it("does not enter an infinite render loop while signals are still loading", () => {
    // Reproduces the pre-fix state: an axes has signal refs assigned (as
    // resetAxesSignals does immediately on Run) but signalCache is still
    // empty (the async .npy fetches haven't resolved yet). buildAlignedData
    // then returns no data every render, and — before the fix — the effect
    // unconditionally called setAnnotationLines([])/setMarginBadge(null)
    // with fresh array/null literals on every run, which never bails out
    // via Object.is and re-triggers the effect via the unmemoized `spines`
    // dependency: a genuine "Maximum update depth exceeded" loop.
    useWaveformStore.setState({
      figures: new Map([
        ["fig-1", { id: "fig-1", name: "Sim", rows: 1, cols: 1, axesIds: ["ax-1"] }],
      ]),
      axes: new Map([
        [
          "ax-1",
          {
            id: "ax-1",
            figureId: "fig-1",
            row: 0,
            col: 0,
            mode: "time",
            signals: [
              { simId: "sim-1", signalName: "v(out)", color: "#ef4444" },
              { simId: "sim-1", signalName: "v(in)", color: "#3b82f6" },
            ],
          },
        ],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map(), // deliberately empty — signals still "loading"
      streamingSignals: new Set(),
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Axes axesId="ax-1" />);

    const loopErrors = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth exceeded"),
    );
    expect(loopErrors).toHaveLength(0);

    errorSpy.mockRestore();
  });
});

describe("FE-160 signal drag-and-drop onto axes", () => {
  afterEach(() => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
  });

  function seedEmptyAxes() {
    useWaveformStore.setState({
      figures: new Map([
        ["fig-1", { id: "fig-1", name: "Sim", rows: 1, cols: 1, axesIds: ["ax-1"] }],
      ]),
      axes: new Map([
        ["ax-1", { id: "ax-1", figureId: "fig-1", row: 0, col: 0, mode: "time", signals: [] }],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
  }

  it("dropping a signal payload adds the signal to the axes", () => {
    seedEmptyAxes();
    const { container } = render(<Axes axesId="ax-1" />);
    const target = container.querySelector(".axes-container") as HTMLElement;

    const dataTransfer = fakeDataTransfer({
      "application/x-signal": JSON.stringify({ simId: "sim-1", signalName: "v(out)" }),
    });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    const signals = useWaveformStore.getState().axes.get("ax-1")?.signals;
    expect(signals).toEqual([expect.objectContaining({ simId: "sim-1", signalName: "v(out)" })]);
  });

  it("dropping a signal does not create a spurious coupling group (regression)", () => {
    seedEmptyAxes();
    const { container } = render(<Axes axesId="ax-1" />);
    const target = container.querySelector(".axes-container") as HTMLElement;

    const dataTransfer = fakeDataTransfer({
      "application/x-signal": JSON.stringify({ simId: "sim-1", signalName: "v(out)" }),
    });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(useWaveformStore.getState().couplingGroups.size).toBe(0);
  });

  it("dropping an axes-link payload (text/plain) still creates a coupling group as before", () => {
    useWaveformStore.setState({
      figures: new Map([
        ["fig-1", { id: "fig-1", name: "Sim", rows: 1, cols: 2, axesIds: ["ax-1", "ax-2"] }],
      ]),
      axes: new Map([
        ["ax-1", { id: "ax-1", figureId: "fig-1", row: 0, col: 0, mode: "time", signals: [] }],
        ["ax-2", { id: "ax-2", figureId: "fig-1", row: 0, col: 1, mode: "time", signals: [] }],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
    const { container } = render(<Axes axesId="ax-1" />);
    const target = container.querySelector(".axes-container") as HTMLElement;

    const dataTransfer = fakeDataTransfer({ "text/plain": "ax-2" });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(useWaveformStore.getState().couplingGroups.size).toBe(1);
    const group = [...useWaveformStore.getState().couplingGroups.values()][0];
    expect(group?.axesIds.sort()).toEqual(["ax-1", "ax-2"]);
  });
});
