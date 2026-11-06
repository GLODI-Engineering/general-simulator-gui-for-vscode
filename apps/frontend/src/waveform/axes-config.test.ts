import type uPlot from "uplot";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_RENDER_POINTS,
  Y_AXIS_SIZE,
  Y_LABEL_SIZE,
  buildAlignedData,
  buildAxes,
  decimateMinMax,
  formatTimeTicks,
  isBodeAxes,
  makePanAwareMousedown,
  overlayPx,
  spineLabel,
  valueExtents,
  xAxisDomain,
  xAxisLabel,
} from "./axes-config";
import type { SpineSpec } from "./axes-config";
import { formatLogTicks, formatTicks } from "./theme";
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
    expect(labels).toEqual(["0ns", "1ns", "2ns", "3ns"]);
  });

  it("renders microsecond-scale ticks in µs", () => {
    const labels = formatTimeTicks([0, 2e-6, 4e-6]);
    expect(labels).toEqual(["0µs", "2µs", "4µs"]);
  });

  it("renders millisecond-scale ticks in ms", () => {
    const labels = formatTimeTicks([0, 0.5e-3, 1e-3]);
    expect(labels).toEqual(["0.0ms", "0.5ms", "1.0ms"]);
  });

  it("renders second-scale ticks in s", () => {
    const labels = formatTimeTicks([0, 1, 2]);
    expect(labels).toEqual(["0s", "1s", "2s"]);
  });

  /**
   * The old formatter chose precision from each value's own magnitude
   * (2 decimals under 10, 1 under 100, 0 above), so an evenly spaced axis
   * came out with three different precisions and read as though the ticks
   * were not evenly spaced at all.
   */
  it("gives every tick on one axis the same number of decimals", () => {
    const labels = formatTimeTicks([0, 5e-3, 10e-3, 15e-3, 20e-3]);
    expect(labels).toEqual(["0ms", "5ms", "10ms", "15ms", "20ms"]);
  });

  it("keeps a half-step visible rather than rounding neighbouring ticks together", () => {
    // uPlot picks 2.5 as an increment often. Deriving decimals from the
    // step's magnitude alone gives 0, and the axis then reads
    // "0 3 5 8 10" — labels that are neither evenly spaced nor true.
    expect(formatTicks([0, 2.5, 5, 7.5, 10])).toEqual(["0.0", "2.5", "5.0", "7.5", "10.0"]);
  });

  it("drops the unit suffix when the axis name already carries it", () => {
    expect(formatTicks([0, 0.005, 0.01])).toEqual(["0", "5m", "10m"]);
  });
});

describe("formatLogTicks", () => {
  it("labels the decades and leaves the minor ticks unlabelled", () => {
    const splits = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 1000];
    expect(formatLogTicks(splits, "Hz")).toEqual([
      "10Hz",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "100Hz",
      "",
      "",
      "1kHz",
    ]);
  });

  it("gives each decade its own prefix rather than one shared across the axis", () => {
    expect(formatLogTicks([10, 1e3, 1e6], "Hz")).toEqual(["10Hz", "1kHz", "1MHz"]);
  });

  it("labels everything when the view sits inside a single decade", () => {
    // Zoomed between two decades there are no decade splits at all, and an
    // axis with no labels is worse than a crowded one.
    expect(formatLogTicks([200, 300, 400], "Hz")).toEqual(["200Hz", "300Hz", "400Hz"]);
  });
});

describe("spineLabel", () => {
  it("names the quantity and puts the unit in brackets", () => {
    expect(spineLabel({ quantity: "voltage", unit: "V", scaleKey: "s", side: 3 })).toBe(
      "Voltage (V)",
    );
    expect(spineLabel({ quantity: "current", unit: "A", scaleKey: "s", side: 1 })).toBe(
      "Current (A)",
    );
  });

  it("titles an unknown quantity rather than dropping it", () => {
    expect(spineLabel({ quantity: "flux_linkage", unit: "Wb", scaleKey: "s", side: 3 })).toBe(
      "Flux linkage (Wb)",
    );
  });

  it("names the Bode spines by what they show", () => {
    expect(spineLabel({ quantity: "dB", unit: "dB", scaleKey: "s", side: 3 })).toBe(
      "Magnitude (dB)",
    );
    expect(spineLabel({ quantity: "deg", unit: "°", scaleKey: "s", side: 1 })).toBe("Phase (°)");
  });
});

describe("buildAxes x-axis", () => {
  it("labels a time-domain axes as Time (s) with a values callback", () => {
    const [x] = buildAxes([], "time");
    expect(x.label).toBe("Time (s)");
    expect(typeof x.values).toBe("function");
  });

  it("labels a frequency-domain axes as Frequency (Hz) with a decade-tick callback", () => {
    const [x] = buildAxes([], "frequency");
    expect(x.label).toBe("Frequency (Hz)");
    // A log axis needs its own formatter — see formatLogTicks. It used to
    // have none, so decade ticks fell back to raw numbers.
    expect(typeof x.values).toBe("function");
  });

  it("labels a parameter-domain axes as Sweep Parameter", () => {
    const [x] = buildAxes([], "parameter");
    expect(x.label).toBe("Sweep Parameter");
    expect(x.values).toBeUndefined();
  });
});

describe("buildAxes y-axes", () => {
  const voltage: SpineSpec = { quantity: "voltage", unit: "V", scaleKey: "scale-voltage", side: 3 };
  const current: SpineSpec = { quantity: "current", unit: "A", scaleKey: "scale-current", side: 1 };

  it("names each spine by quantity and unit instead of the bare unit", () => {
    const [, left] = buildAxes([voltage], "time");
    expect(left?.label).toBe("Voltage (V)");
  });

  /**
   * Stacked time plots are read by running your eye down one moment through
   * all of them, which only works when their plot areas share an x origin
   * and width. An axes with one quantity has a left gutter only; one with
   * two has a right gutter as well — so without a spacer the two panes of a
   * figure were offset by the width of a whole axis.
   */
  it("reserves a right-hand gutter when no spine occupies it, so stacked axes align", () => {
    const oneSpine = buildAxes([voltage], "time");
    const twoSpines = buildAxes([voltage, current], "time");
    expect(oneSpine.length).toBe(twoSpines.length);

    const rightOf = (axes: uPlot.Axis[]) => axes.filter((a) => a.side === 1);
    expect(rightOf(oneSpine)).toHaveLength(1);
    expect(rightOf(twoSpines)).toHaveLength(1);

    const [spacer] = rightOf(oneSpine);
    const [real] = rightOf(twoSpines);
    expect(spacer?.size).toBe(real?.size !== undefined ? Y_AXIS_SIZE + Y_LABEL_SIZE : undefined);
  });

  it("draws nothing in the reserved gutter", () => {
    const [spacer] = buildAxes([voltage], "time").filter((a) => a.side === 1);
    expect(spacer?.label).toBeUndefined();
    expect(spacer?.ticks).toEqual({ show: false });
    expect(spacer?.grid).toEqual({ show: false });
    expect(
      (spacer?.values as ((u: unknown, splits: number[]) => string[]) | undefined)?.(null, [1, 2]),
    ).toEqual([]);
  });

  it("leaves dB and degree ticks unprefixed", () => {
    // 0.5 dB is 0.5 dB, never "500m dB".
    const db: SpineSpec = { quantity: "dB", unit: "dB", scaleKey: "scale-dB", side: 3 };
    const [, mag] = buildAxes([db], "frequency");
    expect(mag?.values).toBeUndefined();
  });
});

describe("overlayPx", () => {
  /**
   * The cursor and Bode-annotation overlays are absolutely positioned divs,
   * laid out in CSS pixels from the chart's corner. uPlot offers device
   * pixels from the corner, or CSS pixels from the plot area — neither of
   * which is that. Using the first (what the code did) put every line at
   * dpr times its correct distance, so on any retina display, or in VS Code
   * at a zoom above 100%, cursors landed outside the plot. At dpr 1 the two
   * agree exactly, which is why it went unnoticed.
   */
  function fakePlot(gutterLeft: number, gutterTop: number, dpr: number) {
    return {
      // uPlot's own contract: `can` asks for device pixels measured from the
      // chart corner; otherwise CSS pixels measured from the plot area.
      valToPos: (value: number, _scale: string, can?: boolean) =>
        can ? (gutterLeft + value) * dpr : value,
      over: { offsetLeft: gutterLeft, offsetTop: gutterTop },
    } as unknown as uPlot;
  }

  it("measures from the chart corner, not the plot area", () => {
    // 100 px into a plot whose y-axis gutter is 76 px wide is 176 px from
    // the chart's own left edge. Dropping the gutter shifts every cursor
    // left by the width of an axis.
    expect(overlayPx(fakePlot(76, 20, 1), 100, "x", "x")).toBe(176);
    expect(overlayPx(fakePlot(76, 20, 1), 100, "scale-voltage", "y")).toBe(120);
  });

  it("gives the same CSS position at any device pixel ratio", () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      expect(overlayPx(fakePlot(76, 20, dpr), 100, "x", "x"), `dpr ${dpr}`).toBe(176);
    }
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
