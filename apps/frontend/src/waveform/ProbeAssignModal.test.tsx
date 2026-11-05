import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useIpcStore } from "../store/ipc";
import { useWaveformStore } from "../store/waveform";
import { ProbeAssignModal } from "./ProbeAssignModal";

describe("FE-115 ProbeAssignModal", () => {
  it("creates a new figure and keeps confirm disabled without manifest", () => {
    useIpcStore.setState({ lastManifest: null });
    useWaveformStore.setState({
      figures: new Map(),
      axes: new Map(),
      couplingGroups: new Map(),
      signalCache: new Map(),
      streamingSignals: new Set(),
    });

    render(<ProbeAssignModal blockId="probe-1" portId="out" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /new figure/i }));

    expect(useWaveformStore.getState().figures.size).toBe(1);
    expect(screen.getByRole("button", { name: /confirm/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
