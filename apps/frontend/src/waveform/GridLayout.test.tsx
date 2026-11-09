import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { GridLayout } from "./GridLayout";

function fakeDataTransfer(entries: Record<string, string>) {
  return {
    types: Object.keys(entries),
    getData: (key: string) => entries[key] ?? "",
    setData: () => {},
    dropEffect: "",
  };
}

describe("FE-160 GridLayout empty-cell signal drop", () => {
  afterEach(() => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
  });

  it("dropping a signal onto an empty cell creates an axes there with the signal", () => {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "Sim", rows: 1, cols: 1, axesIds: [] }]]),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const { container } = render(<GridLayout figureId="fig-1" rows={1} cols={1} />);
    const cell = container.querySelector(".figure-grid__cell--empty") as HTMLElement;
    expect(cell).not.toBeNull();

    const dataTransfer = fakeDataTransfer({
      "application/x-signal": JSON.stringify({ simId: "sim-1", signalName: "v(out)" }),
    });
    fireEvent.dragOver(cell, { dataTransfer });
    fireEvent.drop(cell, { dataTransfer });

    const figure = useWaveformStore.getState().figures.get("fig-1");
    expect(figure?.axesIds.length).toBe(1);
    const axesId = figure?.axesIds[0] as string;
    const axesEntry = useWaveformStore.getState().axes.get(axesId);
    expect(axesEntry?.row).toBe(0);
    expect(axesEntry?.col).toBe(0);
    expect(axesEntry?.signals).toEqual([
      expect.objectContaining({ simId: "sim-1", signalName: "v(out)" }),
    ]);
  });

  it("dropping a malformed/unrelated payload onto an empty cell is a no-op", () => {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "Sim", rows: 1, cols: 1, axesIds: [] }]]),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const { container } = render(<GridLayout figureId="fig-1" rows={1} cols={1} />);
    const cell = container.querySelector(".figure-grid__cell--empty") as HTMLElement;

    const dataTransfer = fakeDataTransfer({ "text/plain": "some-axes-id" });
    fireEvent.dragOver(cell, { dataTransfer });
    fireEvent.drop(cell, { dataTransfer });

    expect(useWaveformStore.getState().figures.get("fig-1")?.axesIds).toEqual([]);
    expect(useWaveformStore.getState().axes.size).toBe(0);
  });
});

describe("FE-167 GridLayout maximize/restore", () => {
  afterEach(() => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
  });

  function seedTwoAxesFigure() {
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
  }

  it("renders every axes (mounted) but hides all but the maximized one", () => {
    seedTwoAxesFigure();
    useWaveformStore.getState().setMaximizedAxes("fig-1", "ax-1");

    const { container } = render(<GridLayout figureId="fig-1" rows={1} cols={2} />);

    const ax1 = container.querySelector('[data-axes-id="ax-1"]');
    const ax2 = container.querySelector('[data-axes-id="ax-2"]');
    expect(ax1).not.toBeNull();
    expect(ax2).not.toBeNull(); // still mounted, not removed

    const ax1Wrapper = ax1?.parentElement as HTMLElement;
    const ax2Wrapper = ax2?.parentElement as HTMLElement;
    expect(ax1Wrapper.style.display).not.toBe("none");
    expect(ax2Wrapper.style.display).toBe("none");
  });

  it("restoring (maximizedAxesId cleared) returns to the normal grid showing every axes", () => {
    seedTwoAxesFigure();
    useWaveformStore.getState().setMaximizedAxes("fig-1", "ax-1");
    const { container, rerender } = render(<GridLayout figureId="fig-1" rows={1} cols={2} />);
    expect(container.querySelector(".figure-grid--maximized")).not.toBeNull();

    useWaveformStore.getState().setMaximizedAxes("fig-1", null);
    rerender(<GridLayout figureId="fig-1" rows={1} cols={2} />);

    expect(container.querySelector(".figure-grid--maximized")).toBeNull();
    expect(container.querySelector('[data-axes-id="ax-1"]')).not.toBeNull();
    expect(container.querySelector('[data-axes-id="ax-2"]')).not.toBeNull();
  });

  it("ignores a maximizedAxesId pointing at an axes that no longer exists (deleted while maximized)", () => {
    seedTwoAxesFigure();
    useWaveformStore.getState().setMaximizedAxes("fig-1", "ax-1");
    useWaveformStore.getState().deleteAxes("ax-1");

    const { container } = render(<GridLayout figureId="fig-1" rows={1} cols={2} />);

    // Falls back to the normal grid instead of rendering a blank maximized view.
    expect(container.querySelector(".figure-grid--maximized")).toBeNull();
    expect(container.querySelector('[data-axes-id="ax-2"]')).not.toBeNull();
  });
});

describe("a row has a floor, and the figure scrolls past it", () => {
  it("never shrinks a row below the height a plot needs", () => {
    // Three axes in a short editor each got about 70 px, and after the
    // header, legend and measurement strip the chart was a sliver. Three
    // unreadable plots is worse than two readable ones you scroll between.
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
      activeAxesId: null,
    });
    const figureId = useWaveformStore.getState().createFigure("F", 3, 1);
    const { container } = render(<GridLayout figureId={figureId} rows={3} cols={1} />);
    const grid = container.querySelector(".figure-grid") as HTMLElement;
    expect(grid.style.gridTemplateRows).toMatch(/minmax\(\d{3}px, 1fr\)/);
    expect(grid.style.overflowY).toBe("auto");
  });
});

describe("#29 resizing a figure's tracks from the keyboard", () => {
  afterEach(() => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
  });

  function twoByTwo() {
    useWaveformStore.setState({
      figures: new Map([["fig-1", { id: "fig-1", name: "Sim", rows: 2, cols: 2, axesIds: [] }]]),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });
    return render(<GridLayout figureId="fig-1" rows={2} cols={2} />);
  }

  /**
   * jsdom gives every element a zero-sized rect, and `nudge` needs the grid's
   * width and height to turn a pixel step into a fraction — so without a size
   * it returns early and nothing moves. Stand in for layout.
   */
  function withGridSize(container: HTMLElement, width: number, height: number) {
    const grid = container.querySelector(".figure-grid") as HTMLElement;
    grid.getBoundingClientRect = () =>
      ({ width, height, top: 0, left: 0, right: width, bottom: height }) as DOMRect;
    return grid;
  }

  it("a splitter is reachable by keyboard at all", () => {
    const { container } = twoByTwo();
    const splitters = [...container.querySelectorAll(".figure-grid__splitter")];
    expect(splitters.length).toBe(2); // one row boundary, one column boundary
    for (const splitter of splitters) {
      expect(splitter.getAttribute("tabindex")).toBe("0");
      expect(splitter.getAttribute("role")).toBe("separator");
    }
  });

  it("ArrowDown on the row splitter grows the row above it", () => {
    const { container } = twoByTwo();
    withGridSize(container, 800, 600);
    const rowSplitter = container.querySelector(".figure-grid__splitter--row") as HTMLElement;

    fireEvent.keyDown(rowSplitter, { key: "ArrowDown" });

    const sizes = useWaveformStore.getState().figures.get("fig-1")?.rowSizes as number[];
    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    // Total is conserved: a splitter rebalances two tracks, it does not add space.
    expect(sizes[0] + sizes[1]).toBeCloseTo(2, 6);
  });

  it("ArrowUp moves it the other way, and Shift moves it further", () => {
    const { container } = twoByTwo();
    withGridSize(container, 800, 600);
    const rowSplitter = container.querySelector(".figure-grid__splitter--row") as HTMLElement;

    fireEvent.keyDown(rowSplitter, { key: "ArrowUp" });
    const small = useWaveformStore.getState().figures.get("fig-1")?.rowSizes as number[];
    expect(small[0]).toBeLessThan(small[1]);

    // Back to equal tracks, so the coarse step is measured from the same start.
    act(() => {
      useWaveformStore.setState({
        figures: new Map([["fig-1", { id: "fig-1", name: "Sim", rows: 2, cols: 2, axesIds: [] }]]),
      });
    });
    fireEvent.keyDown(rowSplitter, { key: "ArrowUp", shiftKey: true });
    const coarse = useWaveformStore.getState().figures.get("fig-1")?.rowSizes as number[];
    expect(coarse[0]).toBeLessThan(small[0]);
  });

  it("the column splitter answers to left and right, not up and down", () => {
    const { container } = twoByTwo();
    withGridSize(container, 800, 600);
    const colSplitter = container.querySelector(".figure-grid__splitter--col") as HTMLElement;

    fireEvent.keyDown(colSplitter, { key: "ArrowDown" });
    expect(useWaveformStore.getState().figures.get("fig-1")?.colSizes).toBeUndefined();

    fireEvent.keyDown(colSplitter, { key: "ArrowRight" });
    const sizes = useWaveformStore.getState().figures.get("fig-1")?.colSizes as number[];
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
  });
});
