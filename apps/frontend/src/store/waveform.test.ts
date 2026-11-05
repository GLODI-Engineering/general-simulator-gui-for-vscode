import { describe, expect, it, vi } from "vitest";

vi.mock("../ipc/transport", () => ({
  getIpcClient: () => ({
    waveformGet: vi.fn().mockResolvedValue({
      time: [0, 1],
      traces: [{ values: [1, 2] }],
    }),
  }),
}));

import { useWaveformStore } from "./waveform";

describe("FE-110/116/118 waveform store", () => {
  it("creates figures/axes and supports coupling + zoom propagation", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 2);
    const a0 = s.createAxes(fig, 0, 0, "time");
    const a1 = s.createAxes(fig, 0, 1, "time");
    const g = s.createCouplingGroup("G1", true, true);
    s.assignAxesToGroup(a0, g);
    s.assignAxesToGroup(a1, g);
    s.propagateZoom(a0, 1, 5, -2, 2);

    const after = useWaveformStore.getState();
    expect(after.figures.get(fig)?.axesIds).toContain(a0);
    expect(after.axes.get(a1)?.xMin).toBe(1);
    expect(after.axes.get(a1)?.xMax).toBe(5);
    expect(after.axes.get(a1)?.yMin).toBe(-2);
    expect(after.axes.get(a1)?.yMax).toBe(2);
  });

  it("resizeFigure grows/shrinks the grid and drops axes that fall outside the new bounds", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 2, 2);
    const inBounds = s.createAxes(fig, 0, 0, "time");
    const outOfBounds = s.createAxes(fig, 1, 1, "time");

    s.resizeFigure(fig, 1, 1);

    const after = useWaveformStore.getState();
    expect(after.figures.get(fig)?.rows).toBe(1);
    expect(after.figures.get(fig)?.cols).toBe(1);
    expect(after.figures.get(fig)?.axesIds).toEqual([inBounds]);
    expect(after.axes.has(inBounds)).toBe(true);
    expect(after.axes.has(outOfBounds)).toBe(false);
  });

  it("setSignalColor updates only the matching signal's color, leaving others untouched", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.addSignalToAxes(axesId, "sim-1", "v(a)");
    s.addSignalToAxes(axesId, "sim-1", "v(b)");
    const firstColor = useWaveformStore.getState().axes.get(axesId)?.signals[0]?.color;

    s.setSignalColor(axesId, "sim-1", "v(b)", "#123456");

    const signals = useWaveformStore.getState().axes.get(axesId)?.signals;
    expect(signals?.[0]?.color).toBe(firstColor);
    expect(signals?.[1]?.color).toBe("#123456");
    expect(signals?.[1]?.simId).toBe("sim-1");
    expect(signals?.[1]?.signalName).toBe("v(b)");
  });

  it("setSignalColor on a signal not present on the axes is a no-op", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.addSignalToAxes(axesId, "sim-1", "v(a)");
    const before = useWaveformStore.getState().axes.get(axesId)?.signals;

    s.setSignalColor(axesId, "sim-1", "v(does-not-exist)", "#123456");

    expect(useWaveformStore.getState().axes.get(axesId)?.signals).toEqual(before);
  });

  it("clearAxes empties signals and zoom/cursor state, leaving id/figureId/row/col/mode untouched", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.addSignalToAxes(axesId, "sim-1", "v(a)");
    s.setAxesZoom(axesId, 1, 5);
    s.setAxesCursor(axesId, "A", 2);
    s.setAxesCursor(axesId, "B", 3);

    s.clearAxes(axesId);

    const entry = useWaveformStore.getState().axes.get(axesId);
    expect(entry?.signals).toEqual([]);
    expect(entry?.xMin).toBeUndefined();
    expect(entry?.xMax).toBeUndefined();
    expect(entry?.yMin).toBeUndefined();
    expect(entry?.yMax).toBeUndefined();
    expect(entry?.cursorA).toBeUndefined();
    expect(entry?.cursorB).toBeUndefined();
    expect(entry?.id).toBe(axesId);
    expect(entry?.figureId).toBe(fig);
    expect(entry?.row).toBe(0);
    expect(entry?.col).toBe(0);
    expect(entry?.mode).toBe("time");
  });

  it("clearAxes on an axes that belongs to a coupling group does not remove it from the group", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 2);
    const a0 = s.createAxes(fig, 0, 0, "time");
    const a1 = s.createAxes(fig, 0, 1, "time");
    const g = s.createCouplingGroup("G1", true, false);
    s.assignAxesToGroup(a0, g);
    s.assignAxesToGroup(a1, g);
    s.addSignalToAxes(a0, "sim-1", "v(a)");

    s.clearAxes(a0);

    const after = useWaveformStore.getState();
    expect(after.axes.get(a0)?.couplingGroupId).toBe(g);
    expect(after.couplingGroups.get(g)?.axesIds.sort()).toEqual([a0, a1].sort());
    expect(after.axes.get(a0)?.signals).toEqual([]);
    // Sibling untouched.
    expect(after.axes.get(a1)?.signals).toEqual([]);
  });

  it("FE-169: creating a 2nd axes in a figure auto-couples both on X (lockX true, lockY false)", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 2);
    const a0 = s.createAxes(fig, 0, 0, "time");
    const a1 = s.createAxes(fig, 0, 1, "time"); // no explicit assignAxesToGroup call anywhere

    const after = useWaveformStore.getState();
    const groupId = after.axes.get(a0)?.couplingGroupId;
    expect(groupId).toBeDefined();
    expect(after.axes.get(a1)?.couplingGroupId).toBe(groupId);
    const group = after.couplingGroups.get(groupId as string);
    expect(group?.lockX).toBe(true);
    expect(group?.lockY).toBe(false);
    expect(group?.axesIds.sort()).toEqual([a0, a1].sort());
  });

  it("FE-169: an axes manually moved to a different explicit group is left out of the automatic per-figure group", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 3);
    const a0 = s.createAxes(fig, 0, 0, "time");
    const a1 = s.createAxes(fig, 0, 1, "time");
    const a2 = s.createAxes(fig, 0, 2, "time");
    const autoGroupId = useWaveformStore.getState().axes.get(a0)?.couplingGroupId as string;

    const explicitGroup = s.createCouplingGroup("Manual", true, true);
    s.assignAxesToGroup(a2, explicitGroup);

    const after = useWaveformStore.getState();
    expect(after.axes.get(a0)?.couplingGroupId).toBe(autoGroupId);
    expect(after.axes.get(a1)?.couplingGroupId).toBe(autoGroupId);
    expect(after.axes.get(a2)?.couplingGroupId).toBe(explicitGroup);
    expect(after.couplingGroups.get(autoGroupId)?.axesIds.sort()).toEqual([a0, a1].sort());
  });

  it("FE-169: a figure with a single axes never gets an automatic coupling group", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const a0 = s.createAxes(fig, 0, 0, "time");

    const after = useWaveformStore.getState();
    expect(after.axes.get(a0)?.couplingGroupId).toBeUndefined();
    expect(after.couplingGroups.size).toBe(0);
  });

  it("FE-169: propagateZoom on one auto-coupled axes updates its sibling's xMin/xMax (X-only lock)", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 2);
    const a0 = s.createAxes(fig, 0, 0, "time");
    const a1 = s.createAxes(fig, 0, 1, "time");

    s.propagateZoom(a0, 1, 5, -2, 2);

    const after = useWaveformStore.getState();
    expect(after.axes.get(a1)?.xMin).toBe(1);
    expect(after.axes.get(a1)?.xMax).toBe(5);
    // lockY is false for the auto group — y should NOT propagate.
    expect(after.axes.get(a1)?.yMin).toBeUndefined();
    expect(after.axes.get(a1)?.yMax).toBeUndefined();
  });

  it("FE-167: setMaximizedAxes sets and clears a figure's maximizedAxesId", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 2);
    const a0 = s.createAxes(fig, 0, 0, "time");
    s.createAxes(fig, 0, 1, "time");

    s.setMaximizedAxes(fig, a0);
    expect(useWaveformStore.getState().figures.get(fig)?.maximizedAxesId).toBe(a0);

    s.setMaximizedAxes(fig, null);
    expect(useWaveformStore.getState().figures.get(fig)?.maximizedAxesId).toBeUndefined();
  });

  it("FE-166: setAxesYZoom sets yMin/yMax without touching xMin/xMax", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.setAxesZoom(axesId, 1, 2);

    s.setAxesYZoom(axesId, -3, 3);

    const entry = useWaveformStore.getState().axes.get(axesId);
    expect(entry?.yMin).toBe(-3);
    expect(entry?.yMax).toBe(3);
    expect(entry?.xMin).toBe(1);
    expect(entry?.xMax).toBe(2);
  });

  it("FE-165: setAxesCursor writes AH/BH (horizontal cursors) independently of A/B (vertical cursors)", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.setAxesCursor(axesId, "A", 1);
    s.setAxesCursor(axesId, "B", 2);

    s.setAxesCursor(axesId, "AH", 5);
    let entry = useWaveformStore.getState().axes.get(axesId);
    expect(entry?.cursorAH).toBe(5);
    expect(entry?.cursorBH).toBeUndefined();
    expect(entry?.cursorA).toBe(1);
    expect(entry?.cursorB).toBe(2);

    s.setAxesCursor(axesId, "BH", 6);
    entry = useWaveformStore.getState().axes.get(axesId);
    expect(entry?.cursorBH).toBe(6);
    expect(entry?.cursorAH).toBe(5);
    expect(entry?.cursorA).toBe(1);
    expect(entry?.cursorB).toBe(2);
  });

  it("clearAxes also resets the FE-165 horizontal cursor fields", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const axesId = s.createAxes(fig, 0, 0, "time");
    s.setAxesCursor(axesId, "AH", 5);
    s.setAxesCursor(axesId, "BH", 6);

    s.clearAxes(axesId);

    const entry = useWaveformStore.getState().axes.get(axesId);
    expect(entry?.cursorAH).toBeUndefined();
    expect(entry?.cursorBH).toBeUndefined();
  });

  it("records propagateZoom on a standalone (ungrouped) axes instead of dropping it", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const s = useWaveformStore.getState();
    const fig = s.createFigure("Figure 1", 1, 1);
    const a0 = s.createAxes(fig, 0, 0, "time");
    // No coupling group assigned — this is the drag-zoom-on-a-solo-axes case.
    s.propagateZoom(a0, 1, 5, -2, 2);

    const entry = useWaveformStore.getState().axes.get(a0);
    expect(entry?.xMin).toBe(1);
    expect(entry?.xMax).toBe(5);
    expect(entry?.yMin).toBe(-2);
    expect(entry?.yMax).toBe(2);
  });

  it("appends streaming chunks and marks streaming lifecycle", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const key = "sim-1::V(out)";
    const s = useWaveformStore.getState();
    s.markStreaming(key);
    s.appendChunk(key, [1, 2, 3]);
    s.appendChunk(key, [4, 5]);

    const cached = useWaveformStore.getState().signalCache.get(key);
    expect(Array.from(cached?.values ?? [])).toEqual([1, 2, 3, 4, 5]);

    s.markStreamingDone(key);
    expect(useWaveformStore.getState().streamingSignals.has(key)).toBe(false);
  });

  it("BE-54: appendChunk populates time from x so the chart can render live", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const key = "sim-1::V(out)";
    const s = useWaveformStore.getState();
    s.appendChunk(key, [1, 2], [0, 1e-6]);
    s.appendChunk(key, [3], [2e-6]);

    const cached = useWaveformStore.getState().signalCache.get(key);
    expect(Array.from(cached?.values ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(cached?.time ?? [])).toEqual([0, 1e-6, 2e-6]);
  });

  it("BE-54: markStreamingDone drops the live cache entry so fetchSignal re-fetches authoritative data", async () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    const key = "sim-1::V(out)";
    const s = useWaveformStore.getState();
    s.appendChunk(key, [1, 2], [0, 1e-6]);
    s.markStreamingDone(key);

    // fetchSignal is async (awaits waveformGet) — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    const cached = useWaveformStore.getState().signalCache.get(key);
    // The mocked waveformGet() returns time:[0,1] values:[1,2] — distinct
    // from the live-streamed [0,1e-6]/[1,2] pair, proving the cache was
    // replaced by a real fetchSignal() call rather than left as-is.
    expect(Array.from(cached?.time ?? [])).toEqual([0, 1]);
  });
});
