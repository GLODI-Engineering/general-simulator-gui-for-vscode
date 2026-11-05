/**
 * FE-35: WaveformTab tests
 */

import { render } from "@testing-library/react";
import React, { act } from "react";
import { describe, expect, it } from "vitest";

// uPlot can't render in jsdom — mock it
vi.mock("uplot", () => ({
  default: class UPlot {
    destroy() {}
  },
}));

import { listEditorTabs, resetEditorTabRegistry } from "../shell/EditorTabRegistry";
import { useIpcStore } from "../store";
import { WaveformTab } from "./WaveformTab";
import { registerWaveformTab } from "./register";

describe("FE-35: WaveformTab", () => {
  it("renders without crashing", async () => {
    useIpcStore.setState({
      lastManifest: { sim_id: "s1", signals: ["V_out"], t_start: 0, t_end: 1 },
      waveformSlice: { time: [0, 1], traces: [{ label: "V_out", values: [1, 2] }] },
    });
    await act(async () => {
      expect(() => render(React.createElement(WaveformTab))).not.toThrow();
      await Promise.resolve();
    });
  });

  it("core.waveform is registered in EditorTabRegistry", async () => {
    resetEditorTabRegistry();
    registerWaveformTab();
    const all = listEditorTabs();
    expect(all.some((t: { id: string }) => t.id === "core.waveform")).toBe(true);
  });
});
