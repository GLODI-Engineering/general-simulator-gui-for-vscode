import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Wire } from "../../model/types";
import { useGraphStore, useUiStore } from "../../store";
import { useWireColorStore } from "../../store/wire-colors";
import { WIRE_STROKE, WireEdge } from "./WireEdge";
import { wireColorForDomain } from "./wire-color";

// FE-86, FE-90 — Wire body branch and junction creation; Custom waypoint-aware wire edge renderer
// Scaffold-only tests. Implement full assertions from progress.frontend.yaml acceptance bullets.
// Acceptance checklist:
// - test_drop_on_wire_body_splits: dropping on a wire body splits target route and adds branch topology.
// - test_crossing_without_junction: crossing polylines remain separate topology nets.
// - test_junction_dots: renderer shows dots at branch points only.
// - test_wire_edge_polyline: WireEdge renders source, waypoint, and target coordinates in order.
// - test_non_orthogonal_detected: non-orthogonal waypoint input is detected.
// - test_derive_wire_edge_type: deriveFlowEdges emits type wire with wire data intact.

describe("FE-86, FE-90 scaffold", () => {
  it.todo("implement acceptance coverage");
});

function loadModelWithWire(wire: Wire) {
  useGraphStore.getState().loadDocument({
    schema_version: 2,
    model: {
      id: "model-1",
      name: "Untitled",
      grid: 10,
      params: [],
      blocks: [],
      wires: [wire],
      lines: [],
      nets: [],
      simulation: { analyses: [] },
      metadata: {},
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal fixture, full ModelDocument shape not needed
  } as any);
}

function makeWire(overrides: Partial<Wire> = {}): Wire {
  return {
    id: "w1",
    from: { block: "b1", port: "p" },
    to: { block: "b2", port: "n" },
    waypoints: [],
    pinned: false,
    net: null,
    kind: "physical-electrical",
    ...overrides,
  };
}

describe("FE-156: WireEdge stroke color/width apply via inline style, not just presentation attributes", () => {
  it("the visible path's inline style carries the domain color and WIRE_STROKE width", () => {
    const wire = makeWire();
    const { container } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    const path = container.querySelector(".wire-edge__path") as SVGPathElement;
    expect(path).toBeTruthy();
    expect(path.style.stroke).toBe(wireColorForDomain("physical-electrical"));
    expect(path.style.strokeWidth).toBe(`${WIRE_STROKE}`);
  });

  it("the wide hit-area path stays transparent and 12px via style, not attributes ReactFlow's CSS would win over", () => {
    const wire = makeWire();
    const { container } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    const hitPath = container.querySelector(".wire-edge__hit") as SVGPathElement;
    expect(hitPath).toBeTruthy();
    expect(hitPath.style.stroke).toBe("transparent");
    expect(hitPath.style.strokeWidth).toBe("12");
    // Neither stroke nor stroke-width should be set as bare SVG presentation
    // attributes anymore — those are the ones a CSS class rule silently wins
    // over regardless of DOM/stylesheet order.
    expect(hitPath.getAttribute("stroke")).toBeNull();
    expect(hitPath.getAttribute("stroke-width")).toBeNull();
  });

  it("selected wires render at 1.5x WIRE_STROKE", () => {
    const wire = makeWire();
    const { container } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={true}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    const path = container.querySelector(".wire-edge__path") as SVGPathElement;
    expect(path.style.strokeWidth).toBe(`${WIRE_STROKE * 1.5}`);
  });
});

describe("user-customizable wire colors and signal-wire arrowheads", () => {
  beforeEach(() => {
    useWireColorStore.setState(useWireColorStore.getInitialState());
  });

  it("a signal wire renders with the shared arrow marker, an electrical wire does not", () => {
    const signalWire = makeWire({ kind: "signal" });
    const { container: signalContainer } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire: signalWire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );
    const signalPath = signalContainer.querySelector(".wire-edge__path") as SVGPathElement;
    expect(signalPath.getAttribute("marker-end")).toBe("url(#gensim-signal-arrow)");

    const electricalWire = makeWire({ kind: "physical-electrical" });
    const { container: elecContainer } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e2"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire: electricalWire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );
    const elecPath = elecContainer.querySelector(".wire-edge__path") as SVGPathElement;
    expect(elecPath.getAttribute("marker-end")).toBeNull();
  });

  it("a user-set wire color override replaces the default domain color", () => {
    useWireColorStore.getState().setWireColor("physical-electrical", "#ff00ff");
    const wire = makeWire({ kind: "physical-electrical" });
    const { container } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );
    const path = container.querySelector(".wire-edge__path") as SVGPathElement;
    expect(path.style.stroke).toBe("#ff00ff");
  });

  it("resetWireColor removes the override and falls back to the default", () => {
    useWireColorStore.getState().setWireColor("signal", "#00ff00");
    expect(useWireColorStore.getState().overrides.signal).toBe("#00ff00");
    useWireColorStore.getState().resetWireColor("signal");
    expect(useWireColorStore.getState().overrides.signal).toBeUndefined();
  });

  it("rejects a non-hex color instead of storing garbage", () => {
    useWireColorStore.getState().setWireColor("signal", "not-a-color");
    expect(useWireColorStore.getState().overrides.signal).toBeUndefined();
  });
});

describe("FE-157: wire naming via the Label tool", () => {
  beforeEach(() => {
    useGraphStore.setState(useGraphStore.getInitialState());
    useUiStore.setState(useUiStore.getInitialState());
  });

  it("clicking a wire in Label mode opens an editable name input, not the wire-branch behavior", () => {
    useUiStore.getState().setCanvasTool("label");
    const wire = makeWire();
    loadModelWithWire(wire);

    const { container } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    const hitPath = container.querySelector(".wire-edge__hit") as SVGPathElement;
    fireEvent.click(hitPath);

    expect(screen.getByLabelText("Wire name")).toBeTruthy();
  });

  it("survives the full mousedown→mouseup→click gesture a real click dispatches, not just a bare click event", () => {
    // Regression test: opening the editor from onMouseDown (instead of
    // onClick) inserted the <input> mid-gesture, which changed the DOM
    // under the pointer before the matching mouseup/click fired — the
    // browser's mouseup then landed elsewhere and immediately blurred the
    // freshly-opened input shut. A bare fireEvent.click (used by the test
    // above) doesn't reproduce that, since it doesn't dispatch mousedown
    // and mouseup as separate events the way a real click does.
    useUiStore.getState().setCanvasTool("label");
    const wire = makeWire();
    loadModelWithWire(wire);

    const { container } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    const hitPath = container.querySelector(".wire-edge__hit") as SVGPathElement;
    fireEvent.mouseDown(hitPath);
    fireEvent.mouseUp(hitPath);
    fireEvent.click(hitPath);

    expect(screen.getByLabelText("Wire name")).toBeTruthy();
  });

  it("typing a name and pressing Enter commits it to the wire and shows it near the wire", () => {
    useUiStore.getState().setCanvasTool("label");
    const wire = makeWire();
    loadModelWithWire(wire);

    const { container, rerender } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    fireEvent.click(container.querySelector(".wire-edge__hit") as SVGPathElement);
    const input = screen.getByLabelText("Wire name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Vin" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useGraphStore.getState().document.model.wires[0]?.label).toBe("Vin");

    // Re-render with the freshly-committed wire object (as Canvas.tsx would
    // after the store update flows back through derive-flow-state) to
    // confirm the label text renders near the wire once set.
    const updatedWire = useGraphStore.getState().document.model.wires[0] as Wire;
    rerender(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire: updatedWire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    expect(container.querySelector(".wire-edge__label")?.textContent).toBe("Vin");
  });

  it("clicking a wire NOT in Label mode does not open the name input", () => {
    useUiStore.getState().setCanvasTool("select");
    const wire = makeWire();
    loadModelWithWire(wire);

    const { container } = render(
      <svg aria-hidden="true">
        <WireEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          data={{ wire }}
          selected={false}
          // biome-ignore lint/suspicious/noExplicitAny: EdgeProps has many required fields irrelevant here
          {...({} as any)}
        />
      </svg>,
    );

    const hitPath = container.querySelector(".wire-edge__hit") as SVGPathElement;
    fireEvent.mouseDown(hitPath);
    fireEvent.click(hitPath);

    expect(screen.queryByLabelText("Wire name")).toBeNull();
  });
});
