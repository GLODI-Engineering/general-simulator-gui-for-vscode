import { describe, expect, it } from "vitest";

import { CHART_THEME_FALLBACK, formatValue, pickPrefix, readChartTheme } from "./theme";

describe("readChartTheme", () => {
  it("reads the --wave-* custom properties the stylesheet defines", () => {
    const root = document.createElement("div");
    root.style.setProperty("--wave-plot-bg", "#123456");
    root.style.setProperty("--wave-grid", "#abcdef");
    document.body.append(root);
    try {
      const theme = readChartTheme(root);
      expect(theme.background).toBe("#123456");
      expect(theme.grid).toBe("#abcdef");
    } finally {
      root.remove();
    }
  });

  it("falls back rather than handing uPlot an empty colour", () => {
    // uPlot writes these straight into canvas context properties. An empty
    // string there is not "use the default" — it is an invalid assignment
    // that silently leaves the previous colour in place, so a missing token
    // would paint the grid in whatever colour was last used.
    const bare = document.createElement("div");
    document.body.append(bare);
    try {
      const theme = readChartTheme(bare);
      expect(theme.grid).toBe(CHART_THEME_FALLBACK.grid);
      expect(theme.tickText).toBe(CHART_THEME_FALLBACK.tickText);
    } finally {
      bare.remove();
    }
  });

  it("always names a concrete font, since canvas text cannot inherit CSS", () => {
    expect(readChartTheme().font).toMatch(/\d+px/);
    expect(readChartTheme().labelFont).toMatch(/\d+px/);
  });
});

describe("pickPrefix", () => {
  it("picks the prefix that puts the value in 1..999", () => {
    expect(pickPrefix(0.004)).toEqual({ scale: 1e-3, symbol: "m" });
    expect(pickPrefix(4)).toEqual({ scale: 1, symbol: "" });
    expect(pickPrefix(4000)).toEqual({ scale: 1e3, symbol: "k" });
    expect(pickPrefix(4e-9)).toEqual({ scale: 1e-9, symbol: "n" });
  });

  it("leaves zero unscaled instead of running off the bottom of the table", () => {
    expect(pickPrefix(0)).toEqual({ scale: 1, symbol: "" });
  });
});

describe("formatValue", () => {
  it("carries its own prefix, since a readout has no axis to share one with", () => {
    expect(formatValue(0.0123, "V")).toBe("12.3 mV");
    expect(formatValue(4700, "Ω")).toBe("4.7 kΩ");
  });

  it("does not pad a round number with significant-figure zeros", () => {
    expect(formatValue(1, "A")).toBe("1 A");
  });

  it("says so when there is no value, rather than printing NaN", () => {
    expect(formatValue(Number.NaN, "V")).toBe("—");
  });
});
