import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_HISTORY_LIMIT, useWaveformStore } from "../store/waveform";
import { fadeForAge, historyOpacity, refLabel, sameSweep, withHistory } from "./history";
import type { SignalRef, WaveformSignal } from "./types";

function signal(simId: string, name: string, n = 4, step = 1e-6): WaveformSignal {
  const time = new Float64Array(n);
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    time[i] = i * step;
    values[i] = i;
  }
  return {
    simId,
    name,
    analysis: "tran",
    quantity: "voltage",
    unit: "V",
    domain: "time",
    time,
    values,
  };
}

function cacheOf(...signals: WaveformSignal[]): Map<string, WaveformSignal> {
  return new Map(signals.map((s) => [`${s.simId}::${s.name}`, s]));
}

const CURRENT: SignalRef[] = [{ simId: "run-3", signalName: "V(out)", color: "#3b82f6" }];

describe("historyOpacity", () => {
  it("recedes with age rather than brightening", () => {
    const steps = [1, 2, 3, 4].map(historyOpacity);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] as number);
    }
    expect(historyOpacity(0)).toBe(1);
  });

  it("has a floor, so the oldest kept run is still visible", () => {
    // A trace that is on the chart but cannot be seen is worse than one
    // that was never drawn.
    expect(historyOpacity(12)).toBeGreaterThanOrEqual(0.18);
  });
});

describe("fadeForAge", () => {
  it("keeps the signal's own colour and only drops its contrast", () => {
    // One signal across runs is the thing being compared, so a different
    // hue per run would make the eye group by run instead of by signal.
    expect(fadeForAge("#3b82f6", 1)).toBe("rgba(59, 130, 246, 0.620)");
  });

  it("leaves the current run alone", () => {
    expect(fadeForAge("#3b82f6", 0)).toBe("#3b82f6");
  });

  it("passes through a colour it cannot parse instead of producing garbage", () => {
    expect(fadeForAge("rebeccapurple", 2)).toBe("rebeccapurple");
  });
});

describe("refLabel", () => {
  it("attaches how many runs old the trace is", () => {
    expect(refLabel({ simId: "a", signalName: "V(out)", color: "#000" })).toBe("V(out)");
    expect(refLabel({ simId: "a", signalName: "V(out)", color: "#000", age: 1 })).toBe(
      "V(out) [1]",
    );
    expect(refLabel({ simId: "a", signalName: "V(out)", color: "#000", age: 2 })).toBe(
      "V(out) [2]",
    );
  });
});

describe("withHistory", () => {
  const cache = cacheOf(
    signal("run-3", "V(out)"),
    signal("run-2", "V(out)"),
    signal("run-1", "V(out)"),
  );

  it("adds the same signal from each past run, newest first", () => {
    const refs = withHistory(CURRENT, cache, ["run-2", "run-1"], 2);
    expect(refs.map((r) => [r.simId, r.age])).toEqual([
      ["run-3", undefined],
      ["run-2", 1],
      ["run-1", 2],
    ]);
  });

  it("draws the current run last, so it sits on top of its own history", () => {
    const refs = withHistory(CURRENT, cache, ["run-2"], 1);
    expect(refs[0]?.age).toBeUndefined();
  });

  it("stops at the requested depth", () => {
    expect(withHistory(CURRENT, cache, ["run-2", "run-1"], 1)).toHaveLength(2);
    expect(withHistory(CURRENT, cache, ["run-2", "run-1"], 0)).toHaveLength(1);
  });

  it("skips a run that never produced the signal", () => {
    // A run from before a probe was added has nothing to show for it, which
    // is not an error and must not become a flat line at zero.
    const partial = cacheOf(signal("run-3", "V(out)"), signal("run-2", "I(L1)"));
    expect(withHistory(CURRENT, partial, ["run-2"], 1)).toHaveLength(1);
  });

  it("carries the current trace's display gain onto its history", () => {
    // Otherwise a scaled current would be compared against an unscaled one.
    const scaled: SignalRef[] = [{ ...(CURRENT[0] as SignalRef), gain: 10 }];
    const refs = withHistory(scaled, cache, ["run-2"], 1);
    expect(refs[1]?.gain).toBe(10);
  });
});

describe("sameSweep", () => {
  /**
   * uPlot draws every series against one sweep vector, so a run with a
   * different time base genuinely cannot be overlaid. Resampling would
   * invent samples; plotting it against the wrong x is worse.
   */
  it("rejects a run with a different number of samples", () => {
    expect(sameSweep(signal("a", "v", 100), signal("b", "v", 200))).toBe(false);
  });

  it("rejects a run over a different span", () => {
    expect(sameSweep(signal("a", "v", 100, 1e-6), signal("b", "v", 100, 2e-6))).toBe(false);
  });

  it("accepts the same sweep", () => {
    expect(sameSweep(signal("a", "v", 100), signal("b", "v", 100))).toBe(true);
  });

  it("keeps a run on a different time base off the chart", () => {
    const mixed = cacheOf(signal("run-3", "V(out)", 4), signal("run-2", "V(out)", 9));
    expect(withHistory(CURRENT, mixed, ["run-2"], 1)).toHaveLength(1);
  });
});

describe("the run history itself", () => {
  beforeEach(() => {
    useWaveformStore.setState({
      runHistory: [],
      currentSimId: null,
      historyLimit: DEFAULT_HISTORY_LIMIT,
      signalCache: new Map(),
    });
  });

  it("moves the outgoing run into the history, newest first", () => {
    const store = useWaveformStore.getState();
    store.beginRun("run-1");
    store.beginRun("run-2");
    store.beginRun("run-3");
    expect(useWaveformStore.getState().runHistory).toEqual(["run-2", "run-1"]);
    expect(useWaveformStore.getState().currentSimId).toBe("run-3");
  });

  it("ignores a repeat of the run already on screen", () => {
    const store = useWaveformStore.getState();
    store.beginRun("run-1");
    store.beginRun("run-1");
    expect(useWaveformStore.getState().runHistory).toEqual([]);
  });

  it("drops the oldest run's samples once the limit is passed", () => {
    // Each kept run is a full copy of every signal, so this is memory, not
    // a preference — an unbounded history is a leak with a nice name.
    useWaveformStore.setState({ historyLimit: 2 });
    const store = useWaveformStore.getState();
    for (const id of ["run-1", "run-2", "run-3", "run-4"]) {
      useWaveformStore.getState().beginRun(id);
      useWaveformStore.getState().cacheSignal(id, "V(out)", signal(id, "V(out)"));
    }
    expect(useWaveformStore.getState().runHistory).toEqual(["run-3", "run-2"]);
    expect(useWaveformStore.getState().signalCache.has("run-1::V(out)")).toBe(false);
    expect(useWaveformStore.getState().signalCache.has("run-3::V(out)")).toBe(true);
  });

  it("evicts immediately when the limit is lowered", () => {
    const store = useWaveformStore.getState();
    for (const id of ["run-1", "run-2", "run-3"]) {
      useWaveformStore.getState().beginRun(id);
      useWaveformStore.getState().cacheSignal(id, "V(out)", signal(id, "V(out)"));
    }
    useWaveformStore.getState().setHistoryLimit(1);
    expect(useWaveformStore.getState().runHistory).toEqual(["run-2"]);
    expect(useWaveformStore.getState().signalCache.has("run-1::V(out)")).toBe(false);
  });
});
