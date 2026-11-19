import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useIpcStore } from "../store/ipc";
import { useWaveformStore } from "../store/waveform";
import { ProbeAssignModal, deriveSignalName } from "./ProbeAssignModal";

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

describe("#98 deriveSignalName", () => {
  const names = ["C1", "VC1", "IC1"];
  const details = [
    { name: "C1", block: "c1_other", port: "p" },
    { name: "VC1", block: "c1", port: "out" },
    { name: "IC1", block: "c1", port: "i" },
  ];

  it("uses the block and port the manifest names, not a name that merely contains them", () => {
    // Substring order would have answered "C1" here -- a signal belonging to
    // a different block.
    expect(deriveSignalName("c1", "out", names, details)).toBe("VC1");
  });

  it("falls back to the first signal that block produced, whatever its port", () => {
    // `VC1`, not `IC1`: manifest order decides, and the port id a symbol uses
    // need not be the one the engine emitted the signal under.
    expect(deriveSignalName("c1", "no-such-port", names, details)).toBe("VC1");
  });

  it("answers null for a block the run produced nothing for", () => {
    expect(deriveSignalName("r9", "p", names, details)).toBeNull();
  });

  it("still guesses by substring when the manifest carries no details", () => {
    expect(deriveSignalName("c1", "out", ["v_c1", "v_out"])).toBe("v_c1");
    expect(deriveSignalName("zz", "out", ["v_c1", "v_out"])).toBe("v_out");
    expect(deriveSignalName("zz", "qq", ["v_c1"])).toBeNull();
  });
});
