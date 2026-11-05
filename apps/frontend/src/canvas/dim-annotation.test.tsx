/**
 * FE-65: dim-annotation tests
 *
 * Acceptance:
 * - CanvasOverlay renders resolved dim label near source port.
 * - Labels toggle on/off via the Ctrl+Alt+D shortcut. (FE-140 removed the
 *   Ctrl+Alt+D shortcut owned by shell/ShellDialogs.tsx — but left
 *   the underlying showDimLabels toggle and its keyboard shortcut intact.)
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Block, Wire } from "../model/types";
import { ShellDialogs } from "../shell/ShellDialogs";
import { useUiStore } from "../store";
import { CanvasOverlay } from "./CanvasOverlay";

afterEach(cleanup);

function makeSignalBlocks(): Block[] {
  return [
    {
      id: "src",
      type: "signal-flow.source.constant",
      paradigm: "signal-flow",
      domain: "signal",
      fidelity: "n_a",
      position: [100, 100],
      rotation: 0,
      mirror: "none",
      params: { value: [1, 2, 3] },
      ic: {},
    } as Block,
    {
      id: "dst",
      type: "signal-flow.sink.scope",
      paradigm: "signal-flow",
      domain: "signal",
      fidelity: "n_a",
      position: [220, 100],
      rotation: 0,
      mirror: "none",
      params: {},
      ic: {},
    } as Block,
  ];
}

describe("FE-65: dim-annotation", () => {
  beforeEach(() => {
    useUiStore.setState(useUiStore.getInitialState());
  });

  it("renders dim labels near source ports", () => {
    const wires: Wire[] = [
      {
        id: "w-sig",
        from: { block: "src", port: "out" },
        to: { block: "dst", port: "in" },
        waypoints: [],
        pinned: false,
        net: null,
        kind: "signal",
      },
    ];

    render(<CanvasOverlay showDimLabels blocks={makeSignalBlocks()} wires={wires} />);

    expect(screen.getByTestId("canvas-dim-overlay")).toBeTruthy();
    expect(screen.getByTestId("dim-label-w-sig").textContent).toBe("[3]");
  });

  it("dim labels toggle via the Ctrl+Alt+D shortcut", () => {
    render(<ShellDialogs />);

    expect(useUiStore.getState().showDimLabels).toBe(false);
    fireEvent.keyDown(window, { key: "d", ctrlKey: true, altKey: true });
    expect(useUiStore.getState().showDimLabels).toBe(true);
  });

  it("acausal wires have no dim label", () => {
    const wires: Wire[] = [
      {
        id: "w-elec",
        from: { block: "src", port: "out" },
        to: { block: "dst", port: "in" },
        waypoints: [],
        pinned: false,
        net: null,
        kind: "physical-electrical",
      },
    ];

    render(<CanvasOverlay showDimLabels blocks={makeSignalBlocks()} wires={wires} />);

    expect(screen.queryByTestId("canvas-dim-overlay")).toBeNull();
    expect(screen.queryByTestId("dim-label-w-elec")).toBeNull();
  });
});
