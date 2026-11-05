import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { WaveformToolbar } from "./WaveformToolbar";

describe("FE-114 WaveformToolbar", () => {
  it("toggles pan mode", () => {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "F", rows: 1, cols: 1, axesIds: ["a-1"] }]]),
      axes: new Map([
        [
          "a-1",
          {
            id: "a-1",
            figureId: "fig-1",
            row: 0,
            col: 0,
            mode: "time",
            signals: [],
            xMin: 0,
            xMax: 1,
            panMode: false,
          },
        ],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    render(<WaveformToolbar axesId="a-1" />);
    const btn = screen.getByRole("button", { name: /pan mode/i });
    fireEvent.click(btn);
    expect(useWaveformStore.getState().axes.get("a-1")?.panMode).toBe(true);
  });

  it("FE-164: Clear Axes empties signals and zoom/cursor state", () => {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "F", rows: 1, cols: 1, axesIds: ["a-1"] }]]),
      axes: new Map([
        [
          "a-1",
          {
            id: "a-1",
            figureId: "fig-1",
            row: 0,
            col: 0,
            mode: "time",
            signals: [{ simId: "sim-1", signalName: "v(a)", color: "#3b82f6" }],
            xMin: 0,
            xMax: 1,
            cursorA: 0.5,
          },
        ],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    render(<WaveformToolbar axesId="a-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Clear Axes" }));

    const entry = useWaveformStore.getState().axes.get("a-1");
    expect(entry?.signals).toEqual([]);
    expect(entry?.xMin).toBeUndefined();
    expect(entry?.xMax).toBeUndefined();
    expect(entry?.cursorA).toBeUndefined();
  });

  it("FE-165: H-Cursor A places a horizontal cursor from the click's Y offset", () => {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "F", rows: 1, cols: 1, axesIds: ["a-1"] }]]),
      axes: new Map([
        [
          "a-1",
          {
            id: "a-1",
            figureId: "fig-1",
            row: 0,
            col: 0,
            mode: "time",
            signals: [],
            yMin: -5,
            yMax: 5,
          },
        ],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    render(<WaveformToolbar axesId="a-1" />);

    // armCursorClick queries the axes-container globally via
    // data-axes-id, matching how Axes.tsx renders it — build a minimal
    // stand-in DOM node here rather than mounting the real Axes component
    // (which can't construct uPlot in this jsdom environment).
    const container = document.createElement("div");
    container.className = "axes-container";
    container.setAttribute("data-axes-id", "a-1");
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    document.body.appendChild(container);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      width: 100,
      height: 100,
      bottom: 100,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "Place Horizontal Cursor A" }));
    // 25% down the 100px-tall canvas -> value = yMax - 0.25*(yMax-yMin) = 2.5.
    fireEvent.click(container, { clientX: 50, clientY: 25 });

    expect(useWaveformStore.getState().axes.get("a-1")?.cursorAH).toBeCloseTo(2.5);

    document.body.removeChild(container);
  });

  it("FE-166: Fit X resets xMin/xMax without touching yMin/yMax", () => {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "F", rows: 1, cols: 1, axesIds: ["a-1"] }]]),
      axes: new Map([
        [
          "a-1",
          {
            id: "a-1",
            figureId: "fig-1",
            row: 0,
            col: 0,
            mode: "time",
            signals: [{ simId: "sim-1", signalName: "v(a)", color: "#3b82f6" }],
            xMin: 1,
            xMax: 2,
            yMin: -10,
            yMax: 10,
          },
        ],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map([
        [
          "sim-1::v(a)",
          {
            simId: "sim-1",
            name: "v(a)",
            analysis: "transient",
            quantity: "voltage",
            unit: "V",
            domain: "time",
            time: new Float64Array([0, 1, 2, 3, 4]),
            values: new Float64Array([0, 1, 2, 1, 0]),
          },
        ],
      ]),
      streamingSignals: new Set(),
    });

    render(<WaveformToolbar axesId="a-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Fit X" }));

    const entry = useWaveformStore.getState().axes.get("a-1");
    expect(entry?.xMin).toBe(0);
    expect(entry?.xMax).toBe(4);
    expect(entry?.yMin).toBe(-10);
    expect(entry?.yMax).toBe(10);
  });

  it("FE-166: Fit Y resets yMin/yMax to the value range within the visible x-window, without touching xMin/xMax", () => {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "F", rows: 1, cols: 1, axesIds: ["a-1"] }]]),
      axes: new Map([
        [
          "a-1",
          {
            id: "a-1",
            figureId: "fig-1",
            row: 0,
            col: 0,
            mode: "time",
            signals: [{ simId: "sim-1", signalName: "v(a)", color: "#3b82f6" }],
            // Zoomed to [1,3] — excludes the t=0 (-100) and t=4 (100) extremes.
            xMin: 1,
            xMax: 3,
          },
        ],
      ]),
      couplingGroups: new Map(),
      signalCache: new Map([
        [
          "sim-1::v(a)",
          {
            simId: "sim-1",
            name: "v(a)",
            analysis: "transient",
            quantity: "voltage",
            unit: "V",
            domain: "time",
            time: new Float64Array([0, 1, 2, 3, 4]),
            values: new Float64Array([-100, 1, 2, 3, 100]),
          },
        ],
      ]),
      streamingSignals: new Set(),
    });

    render(<WaveformToolbar axesId="a-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Fit Y" }));

    const entry = useWaveformStore.getState().axes.get("a-1");
    expect(entry?.yMin).toBe(1);
    expect(entry?.yMax).toBe(3);
    expect(entry?.xMin).toBe(1);
    expect(entry?.xMax).toBe(3);
  });
});
