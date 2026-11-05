/**
 * Canvas integration tests
 *
 * FE-08:
 * - renders without crashing.
 *
 * FE-109:
 * - renders junction dots when 3+ wire vertices coincide.
 * - hides junction dots when no junction exists.
 */

import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGraphStore, useLibraryStore, useUiStore } from "../store";
import { Canvas } from "./Canvas";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useLibraryStore.setState(useLibraryStore.getInitialState());
});

describe("Canvas", () => {
  it("renders without crashing", () => {
    expect(() => render(React.createElement(Canvas))).not.toThrow();
  });

  it("FE-109: renders junction dots when 3-way junction exists", () => {
    useGraphStore.getState().loadDocument({
      schema_version: 2,
      model: {
        id: "model-1",
        name: "Junction model",
        grid: 10,
        params: [],
        blocks: [
          {
            id: "j-center",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [100, 100],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
          {
            id: "j-left",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [20, 100],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
          {
            id: "j-right",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [180, 100],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
          {
            id: "j-top",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [100, 20],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
        ],
        wires: [
          {
            id: "w-left",
            from: { block: "j-left", port: "node" },
            to: { block: "j-center", port: "node" },
            waypoints: [[100, 100]],
            pinned: true,
            net: null,
            kind: "signal",
          },
          {
            id: "w-right",
            from: { block: "j-center", port: "node" },
            to: { block: "j-right", port: "node" },
            waypoints: [[100, 100]],
            pinned: true,
            net: null,
            kind: "signal",
          },
          {
            id: "w-top",
            from: { block: "j-top", port: "node" },
            to: { block: "j-center", port: "node" },
            waypoints: [[100, 100]],
            pinned: true,
            net: null,
            kind: "signal",
          },
        ],
        lines: [],
        nets: [],
        simulation: {},
        metadata: {},
      },
    });

    const { container } = render(<Canvas />);
    expect(container.querySelectorAll(".wire-junction-dot").length).toBeGreaterThan(0);
  });

  it("FE-109: hides junction dots when no junction exists", () => {
    useGraphStore.getState().loadDocument({
      schema_version: 2,
      model: {
        id: "model-1",
        name: "No junction model",
        grid: 10,
        params: [],
        blocks: [
          {
            id: "j-a",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [20, 20],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
          {
            id: "j-b",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [180, 20],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
        ],
        wires: [
          {
            id: "w-single",
            from: { block: "j-a", port: "node" },
            to: { block: "j-b", port: "node" },
            waypoints: [[100, 20]],
            pinned: false,
            net: null,
            kind: "signal",
          },
        ],
        lines: [],
        nets: [],
        simulation: {},
        metadata: {},
      },
    });

    const { container } = render(<Canvas />);
    expect(container.querySelectorAll(".wire-junction-dot")).toHaveLength(0);
  });

  describe("FE-139: toolbar zoom/fit window hooks", () => {
    it("exposes __gensim_canvasZoomIn/Out/FitView while mounted, and clears them on unmount", () => {
      const windowRef = window as typeof window & {
        __gensim_canvasZoomIn?: () => void;
        __gensim_canvasZoomOut?: () => void;
        __gensim_canvasFitView?: () => void;
      };

      const { unmount } = render(<Canvas />);

      expect(typeof windowRef.__gensim_canvasZoomIn).toBe("function");
      expect(typeof windowRef.__gensim_canvasZoomOut).toBe("function");
      expect(typeof windowRef.__gensim_canvasFitView).toBe("function");

      // Calling them must not throw even in jsdom (no real layout/rAF).
      expect(() => windowRef.__gensim_canvasZoomIn?.()).not.toThrow();
      expect(() => windowRef.__gensim_canvasZoomOut?.()).not.toThrow();
      expect(() => windowRef.__gensim_canvasFitView?.()).not.toThrow();

      unmount();
      expect(windowRef.__gensim_canvasZoomIn).toBeUndefined();
      expect(windowRef.__gensim_canvasZoomOut).toBeUndefined();
      expect(windowRef.__gensim_canvasFitView).toBeUndefined();
    });
  });
});
