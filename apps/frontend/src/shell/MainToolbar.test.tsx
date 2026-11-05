/**
 * FE-144: MainToolbar horizontal wheel-scroll tests
 * FE-155: MainToolbar simulation time display tests
 *
 * (Ported from the former SpiceToolbar.test.tsx when SpiceToolbar was split
 * into shell/MainToolbar.tsx — always visible, File+Run only — and
 * canvas/SchematicToolbar.tsx — Schematic-tab-only tools.)
 *
 * Acceptance:
 * - A vertical wheel gesture over the toolbar scrolls it horizontally when
 *   it overflows (the toolbar has no visible affordance otherwise at
 *   typical window widths).
 * - No-op when the toolbar isn't overflowing, so normal page scroll isn't
 *   hijacked unnecessarily.
 * - Simulation progress/time display behaves as before the split.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useIpcStore } from "../store";
import { useSimSettingsStore } from "../store/sim-settings";
import { useWaveformStore } from "../store/waveform";
import { MainToolbar } from "./MainToolbar";

afterEach(cleanup);

beforeEach(() => {
  useIpcStore.setState(useIpcStore.getInitialState());
  useSimSettingsStore.setState(useSimSettingsStore.getInitialState());
  useWaveformStore.setState(useWaveformStore.getInitialState());
});

describe("FE-144: MainToolbar horizontal wheel scroll", () => {
  it("test_wheel_scrolls_horizontally_when_overflowing: a vertical wheel gesture scrolls the toolbar horizontally when it overflows", () => {
    const { container } = render(<MainToolbar onAction={() => {}} />);
    const toolbar = container.querySelector(".main-toolbar") as HTMLDivElement;
    expect(toolbar).toBeTruthy();

    // jsdom doesn't compute real layout, so scrollWidth/clientWidth are
    // always 0 by default — simulate an overflowing toolbar explicitly.
    Object.defineProperty(toolbar, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(toolbar, "clientWidth", { value: 1000, configurable: true });
    toolbar.scrollLeft = 0;

    fireEvent.wheel(toolbar, { deltaY: 120 });

    expect(toolbar.scrollLeft).toBe(120);
  });

  it("test_wheel_noop_when_not_overflowing: no horizontal scroll when the toolbar already fits", () => {
    const { container } = render(<MainToolbar onAction={() => {}} />);
    const toolbar = container.querySelector(".main-toolbar") as HTMLDivElement;
    expect(toolbar).toBeTruthy();

    Object.defineProperty(toolbar, "scrollWidth", { value: 800, configurable: true });
    Object.defineProperty(toolbar, "clientWidth", { value: 1000, configurable: true });
    toolbar.scrollLeft = 0;

    fireEvent.wheel(toolbar, { deltaY: 120 });

    expect(toolbar.scrollLeft).toBe(0);
  });
});

describe("FE-155: MainToolbar simulation time display", () => {
  it("does not show the old static 'Starting simulation' label while busy", () => {
    useIpcStore.setState({ status: "busy", simProgress: 0, simMessage: "Starting simulation…" });
    render(<MainToolbar onAction={() => {}} />);

    expect(screen.queryByText("Starting simulation…")).toBeNull();
  });

  it("shows current / final simulated time below the progress bar, from progress fraction before any data streams", () => {
    useSimSettingsStore.setState((state) => ({ settings: { ...state.settings, tEnd: 0.01 } }));
    useIpcStore.setState({ status: "busy", simProgress: 0.5 });
    render(<MainToolbar onAction={() => {}} />);

    // 50% of 10ms = 5ms current, 10ms final.
    expect(screen.getByText("5ms / 10ms")).toBeTruthy();
  });

  it("prefers the live-streamed signal time over the progress-fraction estimate once data has arrived", () => {
    useSimSettingsStore.setState((state) => ({ settings: { ...state.settings, tEnd: 0.01 } }));
    useIpcStore.setState({
      status: "busy",
      simProgress: 0.1, // would estimate 1ms — the real streamed data (7ms) should win.
      lastManifest: { sim_id: "sim-1", signals: ["v(out)"], t_start: 0, t_end: 0 },
    });
    useWaveformStore.setState((state) => {
      const signalCache = new Map(state.signalCache);
      signalCache.set("sim-1::v(out)", {
        simId: "sim-1",
        name: "v(out)",
        analysis: "transient",
        quantity: "voltage",
        unit: "V",
        domain: "time",
        time: new Float64Array([0, 0.003, 0.007]),
        values: new Float64Array([0, 1, 2]),
      });
      return { signalCache };
    });

    render(<MainToolbar onAction={() => {}} />);

    expect(screen.getByText("7ms / 10ms")).toBeTruthy();
  });

  it("shows the progress meter without the old text label while busy", () => {
    useIpcStore.setState({ status: "busy", simProgress: 0.25 });
    render(<MainToolbar onAction={() => {}} />);

    const meter = screen.getByRole("meter", { name: /simulation progress/i });
    expect(meter).toBeTruthy();
    expect(screen.queryByText(/^0\.\ds$/)).toBeNull();
  });
});
