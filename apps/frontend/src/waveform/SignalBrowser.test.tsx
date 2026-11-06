import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useIpcStore } from "../store/ipc";
import { useWaveformStore } from "../store/waveform";
import { SignalBrowser } from "./SignalBrowser";
import type { WaveformSignal } from "./types";

function signal(name: string, unit: string): WaveformSignal {
  return {
    simId: "run-1",
    name,
    analysis: "tran",
    quantity: unit === "V" ? "voltage" : "current",
    unit,
    domain: "time",
    time: Float64Array.from([0, 1e-6, 2e-6]),
    values: Float64Array.from([0, 1, 2]),
  };
}

beforeEach(() => {
  useWaveformStore.setState({
    figures: new Map(),
    axes: new Map(),
    couplingGroups: new Map(),
    signalCache: new Map(),
    streamingSignals: new Set(),
    activeAxesId: null,
  });
  useIpcStore.setState({ lastManifest: null });
});

function seedResult(): string {
  const store = useWaveformStore.getState();
  store.cacheSignal("run-1", "V(out)", signal("V(out)", "V"));
  store.cacheSignal("run-1", "I(L1)", signal("I(L1)", "A"));
  const figureId = useWaveformStore.getState().createFigure("Results", 1, 1);
  return useWaveformStore.getState().createAxes(figureId, 0, 0);
}

describe("where the signal list comes from", () => {
  /**
   * The browser used to read only the live kernel's last manifest, so a
   * saved result opened from a file showed "No simulation results
   * available" next to three populated charts.
   */
  it("lists signals that are in the store but in no manifest", () => {
    seedResult();
    render(<SignalBrowser />);
    expect(screen.getByText("V(out)")).toBeTruthy();
    expect(screen.getByText("I(L1)")).toBeTruthy();
    expect(screen.queryByText("No simulation results available.")).toBeNull();
  });

  it("still lists a manifest's signals that have not been fetched yet", () => {
    // A live run names its signals before their samples arrive.
    useIpcStore.setState({
      lastManifest: { sim_id: "run-1", signals: ["V(in)"], t_start: 0, t_end: 1 },
    });
    render(<SignalBrowser />);
    expect(screen.getByText("V(in)")).toBeTruthy();
  });

  it("does not list a signal twice when it is in both", () => {
    seedResult();
    useIpcStore.setState({
      lastManifest: { sim_id: "run-1", signals: ["V(out)"], t_start: 0, t_end: 1 },
    });
    render(<SignalBrowser />);
    expect(screen.getAllByText("V(out)")).toHaveLength(1);
  });

  it("says so plainly when there really is nothing", () => {
    render(<SignalBrowser />);
    expect(screen.getByText("No simulation results available.")).toBeTruthy();
  });
});

describe("ticking a signal onto an axes", () => {
  it("adds it to the targeted axes, and unticking removes it", () => {
    const axesId = seedResult();
    render(<SignalBrowser />);

    const checkbox = screen.getByLabelText("Plot V(out)") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(
      useWaveformStore
        .getState()
        .axes.get(axesId)
        ?.signals.map((s) => s.signalName),
    ).toEqual(["V(out)"]);

    fireEvent.click(screen.getByLabelText("Plot V(out)"));
    expect(useWaveformStore.getState().axes.get(axesId)?.signals).toEqual([]);
  });

  it("reflects what is already on the targeted axes", () => {
    const axesId = seedResult();
    useWaveformStore.getState().addSignalToAxes(axesId, "run-1", "I(L1)");
    render(<SignalBrowser />);
    expect((screen.getByLabelText("Plot I(L1)") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Plot V(out)") as HTMLInputElement).checked).toBe(false);
  });

  it("names the axes it is about to add to, rather than guessing from focus", () => {
    seedResult();
    render(<SignalBrowser />);
    const select = screen.getByLabelText("Add to") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe("Results → Axes (0,0)");
  });

  it("puts a ticked signal on the second axes once that one is targeted", () => {
    const first = seedResult();
    const figureId = useWaveformStore.getState().axes.get(first)?.figureId as string;
    const second = useWaveformStore.getState().createAxes(figureId, 0, 1);

    render(<SignalBrowser />);
    fireEvent.change(screen.getByLabelText("Add to"), { target: { value: second } });
    fireEvent.click(screen.getByLabelText("Plot V(out)"));

    expect(useWaveformStore.getState().axes.get(second)?.signals).toHaveLength(1);
    expect(useWaveformStore.getState().axes.get(first)?.signals).toHaveLength(0);
  });

  it("cannot be ticked when there is nowhere to put it", () => {
    const store = useWaveformStore.getState();
    store.cacheSignal("run-1", "V(out)", signal("V(out)", "V"));
    render(<SignalBrowser />);
    expect((screen.getByLabelText("Plot V(out)") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("a differing quantity gets its own y-axis", () => {
  it("groups signals into one spine per quantity", async () => {
    // The rule lives in buildSpines; this is the path the checkbox takes to
    // reach it — tick a current onto an axes that holds a voltage and the
    // chart gains a second scale rather than flattening the current.
    const { buildSpines } = await import("./axes-config");
    const axesId = seedResult();
    render(<SignalBrowser />);
    fireEvent.click(screen.getByLabelText("Plot V(out)"));
    fireEvent.click(screen.getByLabelText("Plot I(L1)"));

    const refs = useWaveformStore.getState().axes.get(axesId)?.signals ?? [];
    const spines = buildSpines(refs, useWaveformStore.getState().signalCache);
    expect(spines.map((s) => s.quantity)).toEqual(["voltage", "current"]);
    expect(spines.map((s) => s.side)).toEqual([3, 1]);
  });
});
