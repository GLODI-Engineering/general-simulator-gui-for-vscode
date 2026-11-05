import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWaveformStore } from "../store/waveform";
import { CouplingGroupsPanel } from "./CouplingGroupsPanel";

describe("FE-116 CouplingGroupsPanel", () => {
  it("creates a coupling group via form", () => {
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    render(<CouplingGroupsPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: /new group name/i }), {
      target: { value: "G1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /new group/i }));

    expect(useWaveformStore.getState().couplingGroups.size).toBe(1);
  });
});
