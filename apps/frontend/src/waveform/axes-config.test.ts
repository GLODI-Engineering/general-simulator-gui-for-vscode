import type uPlot from "uplot";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_RENDER_POINTS,
  buildAlignedData,
  buildAxes,
  decimateMinMax,
  formatTimeTicks,
  isBodeAxes,
  makePanAwareMousedown,
  valueExtents,
  xAxisDomain,
  xAxisLabel,
} from "./axes-config";
import type { SignalRef, WaveformSignal } from "./types";

function makeSignal(overrides: Partial<WaveformSignal>): WaveformSignal {
  return {
    simId: "sim1",
    name: "V_out",
    analysis: "transient",
    quantity: "voltage",
    unit: "V",
    domain: "time",
    time: new Float64Array([0, 1]),
    values: new Float64Array([0, 1]),
    ...overrides,
  };
}

function makeRef(signalName: string): SignalRef {
  return { simId: "sim1", signalName, color: "#3b82f6" };
}

describe("xAxisDomain", () => {
  it("returns 'time' when no signals are cached yet", () => {
    const refs = [makeRef("V_out")];
    expect(xAxisDomain(refs, new Map())).toBe("time");
  });

  it("returns 'time' for plain transient signals", () => {
    const refs = [makeRef("V_out")];
    const cache = new Map([["sim1::V_out", makeSignal({ domain: "time" })]]);
    expect(xAxisDomain(refs, cache)).toBe("time");
  });

  it("returns 'frequency' for AC signals", () => {
    const refs = [makeRef("V_out")];
    const cache = new Map([
      ["sim1::V_out", makeSignal({ analysis: "ac_mag", domain: "frequency" })],
    ]);
    expect(xAxisDomain(refs, cache)).toBe("frequency");
  });

  it("returns 'frequency' for NOISE signals (not bode mode)", () => {
    const refs = [makeRef("onoise")];
    const cache = new Map([
      ["sim1::onoise", makeSignal({ analysis: "noise", domain: "frequency" })],
    ]);
    expect(xAxisDomain(refs, cache)).toBe("frequency");
    expect(isBodeAxes(refs, cache)).toBe(false);
  });

  it("returns 'parameter' for DC sweep signals", () => {
    const refs = [makeRef("I_d")];
    const cache = new Map([
      ["sim1::I_d", makeSignal({ analysis: "dc_sweep", domain: "parameter" })],
    ]);
    expect(xAxisDomain(refs, cache)).toBe("parameter");
  });

  it("prefers frequency over parameter when signals disagree", () => {
    const refs = [makeRef("a"), makeRef("b")];
    const cache = new Map([
      ["sim1::a", makeSignal({ domain: "parameter" })],
      ["sim1::b", makeSignal({ analysis: "ac_mag", domain: "frequency" })],
    ]);
    expect(xAxisDomain(refs, cache)).toBe("frequency");
  });
});

describe("xAxisLabel", () => {
  it("labels each domain distinctly", () => {
    expect(xAxisLabel("time")).toBe("Time (s)");
    expect(xAxisLabel("frequency")).toBe("Frequency (Hz)");
    expect(xAxisLabel("parameter")).toBe("Sweep Parameter");
  });
});

describe("formatTimeTicks", () => {
  it("renders sub-microsecond ticks in nanoseconds instead of rounding to 0", () => {
    const labels = formatTimeTicks([0, 1e-9, 2e-9, 3e-9]);
    expect(labels).toEqual(["0.00ns", "1.00ns", "2.00ns", "3.00ns"]);
  });

  it("renders microsecond-scale ticks in µs", () => {
    const labels = formatTimeTicks([0, 2e-6, 4e-6]);
    expect(labels).toEqual(["0.00µs", "2.00µs", "4.00µs"]);
  });

  it("renders millisecond-scale ticks in ms", () => {
    const labels = formatTimeTicks([0, 0.5e-3, 1e-3]);
    expect(labels).toEqual(["0.00ms", "0.50ms", "1.00ms"]);
  });

  it("renders second-scale ticks in s", () => {
    const labels = formatTimeTicks([0, 1, 2]);
    expect(labels).toEqual(["0.00s", "1.00s", "2.00s"]);
  });
});

describe("buildAxes x-axis", () => {
  it("labels a time-domain axes as Time (s) with a values callback", () => {
    const [x] = buildAxes([], "time");
    expect(x.label).toBe("Time (s)");
    expect(typeof x.values).toBe("function");
  });

  it("labels a frequency-domain axes as Frequency (Hz) without a time-tick callback", () => {
    const [x] = buildAxes([], "frequency");
    expect(x.label).toBe("Frequency (Hz)");
    expect(x.values).toBeUndefined();
  });

  it("labels a parameter-domain axes as Sweep Parameter", () => {
    const [x] = buildAxes([], "parameter");
    expect(x.label).toBe("Sweep Parameter");
    expect(x.values).toBeUndefined();
  });
});

describe("FE-159 decimateMinMax", () => {
  it("caps a 300,000-point signal to <= MAX_RENDER_POINTS while preserving its min/max envelope", () => {
    const n = 300_000;
    const time = new Float64Array(n);
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      time[i] = i * 1e-9;
      values[i] = Math.sin(i / 37);
    }
    // Plant an unambiguous global min and max that a naive stride sample could skip.
    values[12345] = 1000;
    values[54321] = -1000;

    const { time: decTime, values: decValues } = decimateMinMax(time, values, MAX_RENDER_POINTS);

    expect(decTime.length).toBeLessThanOrEqual(MAX_RENDER_POINTS);
    expect(decValues.length).toBe(decTime.length);
    expect(Math.max(...decValues)).toBe(1000);
    expect(Math.min(...decValues)).toBe(-1000);
  });

  it("passes a 500-point signal through unchanged (under budget)", () => {
    const time = new Float64Array(500).map((_, i) => i);
    const values = new Float64Array(500).map((_, i) => Math.sin(i));

    const result = decimateMinMax(time, values, MAX_RENDER_POINTS);

    expect(result.time).toBe(time);
    expect(result.values).toBe(values);
  });

  it("decimates multiple signals of different lengths independently against the same budget", () => {
    const short = new Float64Array(100).map((_, i) => i);
    const long = new Float64Array(50_000).map((_, i) => Math.cos(i / 100));
    const longTime = new Float64Array(50_000).map((_, i) => i);

    const shortResult = decimateMinMax(short, short, 20_000);
    const longResult = decimateMinMax(longTime, long, 20_000);

    expect(shortResult.values.length).toBe(100);
    expect(longResult.values.length).toBeLessThanOrEqual(20_000);
    expect(longResult.values.length).toBeGreaterThan(100);
  });
});

describe("FE-159 buildAlignedData decimation", () => {
  it("caps every series on an axes to <= MAX_RENDER_POINTS using one shared index set", () => {
    const n = 300_000;
    const cache = new Map<string, WaveformSignal>();
    const refs: SignalRef[] = [];
    for (let s = 0; s < 24; s++) {
      const name = `v(n${s})`;
      const time = new Float64Array(n).map((_, i) => i * 1e-9);
      const values = new Float64Array(n).map((_, i) => Math.sin(i / (10 + s)));
      cache.set(`sim1::${name}`, makeSignal({ name, time, values }));
      refs.push(makeRef(name));
    }

    const data = buildAlignedData(refs, cache);

    for (const series of data) {
      expect(series.length).toBeLessThanOrEqual(MAX_RENDER_POINTS);
    }
    // Every series shares the same (decimated) length — index-aligned to one x axis.
    const lengths = new Set(data.map((s) => s.length));
    expect(lengths.size).toBe(1);
  });

  it("does not decimate when the reference signal is under budget", () => {
    const time = new Float64Array(500).map((_, i) => i);
    const values = new Float64Array(500).map((_, i) => i * 2);
    const cache = new Map<string, WaveformSignal>([["sim1::v(out)", makeSignal({ time, values })]]);

    const data = buildAlignedData([makeRef("v(out)")], cache);

    expect(data[0]?.length).toBe(500);
  });
});

describe("FE-163 makePanAwareMousedown", () => {
  function makeFakeUplot() {
    return {
      scales: {
        x: { min: 0, max: 10 },
        "scale-voltage": { min: -5, max: 5 },
      },
      setScale: vi.fn(),
      over: {
        getBoundingClientRect: () => ({ width: 100, height: 100 }) as DOMRect,
      },
    } as unknown as uPlot;
  }

  it("calls the default handler (box-zoom) when pan mode is off", () => {
    const handler = vi.fn(() => null);
    const factory = makePanAwareMousedown(
      () => false,
      () => "scale-voltage",
    );
    const u = makeFakeUplot();
    const mousedown = factory(u, document.createElement("div"), handler);

    const event = new MouseEvent("mousedown", { clientX: 10, clientY: 10, button: 0 });
    mousedown?.(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(u.setScale).not.toHaveBeenCalled();
  });

  it("pans the x and primary y scales on drag when pan mode is on", () => {
    const handler = vi.fn(() => null);
    const factory = makePanAwareMousedown(
      () => true,
      () => "scale-voltage",
    );
    const u = makeFakeUplot();
    const mousedown = factory(u, document.createElement("div"), handler);

    const downEvent = new MouseEvent("mousedown", { clientX: 50, clientY: 50, button: 0 });
    mousedown?.(downEvent);
    expect(handler).not.toHaveBeenCalled();

    // Drag 10px right, 10px down (rect is 100x100, scale spans 10 and 10).
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 60, clientY: 60 }));

    // x range [0,10], dragged 10% right -> shift left by 1 (content follows cursor).
    expect(u.setScale).toHaveBeenCalledWith("x", { min: -1, max: 9 });
    // y range [-5,5], dragged 10% down -> shift up by 1.
    expect(u.setScale).toHaveBeenCalledWith("scale-voltage", { min: -4, max: 6 });

    document.dispatchEvent(new MouseEvent("mouseup"));
  });

  it("stops reacting to mousemove after mouseup", () => {
    const handler = vi.fn(() => null);
    const factory = makePanAwareMousedown(
      () => true,
      () => "scale-voltage",
    );
    const u = makeFakeUplot();
    const mousedown = factory(u, document.createElement("div"), handler);

    mousedown?.(new MouseEvent("mousedown", { clientX: 50, clientY: 50, button: 0 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
    (u.setScale as ReturnType<typeof vi.fn>).mockClear();

    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 90, clientY: 90 }));
    expect(u.setScale).not.toHaveBeenCalled();
  });

  it("ignores non-primary (e.g. right-click) mouse buttons, deferring to the default handler", () => {
    const handler = vi.fn(() => null);
    const factory = makePanAwareMousedown(
      () => true,
      () => "scale-voltage",
    );
    const u = makeFakeUplot();
    const mousedown = factory(u, document.createElement("div"), handler);

    const event = new MouseEvent("mousedown", { clientX: 10, clientY: 10, button: 2 });
    mousedown?.(event);

    expect(handler).toHaveBeenCalledWith(event);
  });
});

describe("FE-165/FE-166 valueExtents", () => {
  it("returns [min, max] of every signal's values across refs", () => {
    const cache = new Map<string, WaveformSignal>([
      [
        "sim1::v(a)",
        makeSignal({
          name: "v(a)",
          time: new Float64Array([0, 1, 2]),
          values: new Float64Array([-1, 0, 3]),
        }),
      ],
      [
        "sim1::v(b)",
        makeSignal({
          name: "v(b)",
          time: new Float64Array([0, 1, 2]),
          values: new Float64Array([5, -4, 1]),
        }),
      ],
    ]);
    const refs = [makeRef("v(a)"), makeRef("v(b)")];

    expect(valueExtents(refs, cache)).toEqual([-4, 5]);
  });

  it("restricts to points whose time falls within [xMin, xMax] when given", () => {
    const cache = new Map<string, WaveformSignal>([
      [
        "sim1::v(a)",
        makeSignal({
          name: "v(a)",
          time: new Float64Array([0, 1, 2, 3]),
          values: new Float64Array([100, 1, 2, -100]),
        }),
      ],
    ]);
    const refs = [makeRef("v(a)")];

    // Excludes the extreme values at t=0 and t=3.
    expect(valueExtents(refs, cache, 1, 2)).toEqual([1, 2]);
  });

  it("returns null when no cached signal has any data", () => {
    expect(valueExtents([makeRef("v(a)")], new Map())).toBeNull();
  });
});
