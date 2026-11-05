/**
 * FE-03: graph store tests
 * Uses useGraphStore.getState() — no createGraph factory needed.
 */

import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { getMetadataPortCenters } from "../canvas/nodes/port-hit-test";
import type { Block, BlockMetadata } from "../model/types";
import { useGraphStore } from "./graph";
import { useLibraryStore } from "./library";

function resetStore() {
  useGraphStore.setState(useGraphStore.getInitialState());
  useLibraryStore.setState({ catalog: {} });
}

beforeEach(() => {
  resetStore();
});

function isOrthogonal(points: Array<[number, number]>): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    if (!current || !next) {
      return false;
    }
    if (current[0] !== next[0] && current[1] !== next[1]) {
      return false;
    }
  }
  return true;
}

describe("FE-03: graph store", () => {
  it("addBlock: block appears in store", () => {
    const store = useGraphStore.getState();
    store.transact("add", () => {
      store.addBlock({
        id: "b1",
        type: "signal.step",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
      });
    });
    const blocks = useGraphStore.getState().document.model.blocks;
    expect(blocks.some((b) => b.id === "b1")).toBe(true);
  });

  it("moveBlocks: only position changes", () => {
    const store = useGraphStore.getState();
    store.transact("add", () => {
      store.addBlock({
        id: "b1",
        type: "signal.step",
        position: [10, 10],
        rotation: 0,
        mirror: "none",
        params: {},
      });
    });
    store.transact("move", () => {
      store.moveBlocks(["b1"], [5, 5]);
    });
    const block = useGraphStore.getState().document.model.blocks.find((b) => b.id === "b1")!;
    expect(block.position).toEqual([15, 15]);
    expect(block.type).toBe("signal.step");
  });

  it("deleteBlocks: block and its connected wires are removed", () => {
    const store = useGraphStore.getState();
    store.transact("setup", () => {
      store.addBlock({
        id: "b1",
        type: "signal.step",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
      });
      store.addBlock({
        id: "b2",
        type: "control.gain",
        position: [100, 0],
        rotation: 0,
        mirror: "none",
        params: {},
      });
      store.addWire({
        id: "w1",
        from: { block: "b1", port: "out" },
        to: { block: "b2", port: "in" },
        waypoints: [],
        pinned: false,
      });
    });
    store.transact("delete", () => {
      store.deleteBlocks(["b1"]);
    });
    const state = useGraphStore.getState();
    expect(state.document.model.blocks.find((b) => b.id === "b1")).toBeUndefined();
    expect(state.document.model.wires.find((w) => w.id === "w1")).toBeUndefined();
  });

  it("float coordinate write throws in dev mode", () => {
    const store = useGraphStore.getState();
    expect(() => {
      store.transact("bad", () => {
        store.addBlock({
          id: "b1",
          type: "signal.step",
          position: [1.5, 0],
          rotation: 0,
          mirror: "none",
          params: {},
        });
      });
    }).toThrow();
  });

  it("undo restores previous state", () => {
    const store = useGraphStore.getState();
    store.transact("add", () => {
      store.addBlock({
        id: "b1",
        type: "signal.step",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
      });
    });
    expect(useGraphStore.getState().document.model.blocks).toHaveLength(1);
    useGraphStore.getState().undo();
    expect(useGraphStore.getState().document.model.blocks).toHaveLength(0);
  });

  it("redo re-applies the undone frame", () => {
    const store = useGraphStore.getState();
    store.transact("add", () => {
      store.addBlock({
        id: "b1",
        type: "signal.step",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
      });
    });
    useGraphStore.getState().undo();
    useGraphStore.getState().redo();
    expect(useGraphStore.getState().document.model.blocks).toHaveLength(1);
  });

  it("new mutation after undo clears the redo stack", () => {
    const store = useGraphStore.getState();
    store.transact("add", () => {
      store.addBlock({
        id: "b1",
        type: "signal.step",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
      });
    });
    useGraphStore.getState().undo();
    useGraphStore.getState().transact("add2", () => {
      useGraphStore.getState().addBlock({
        id: "b2",
        type: "control.gain",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
      });
    });
    expect(useGraphStore.getState().redoStack).toHaveLength(0);
  });

  it("random mutations → undo × N restores initial state", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.nat(50).map((n) => `b${n}`),
            x: fc.integer({ min: 0, max: 100 }),
            y: fc.integer({ min: 0, max: 100 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (specs) => {
          resetStore();
          const dedupedSpecs = specs.filter((s, i) => specs.findIndex((x) => x.id === s.id) === i);
          for (const s of dedupedSpecs) {
            useGraphStore.getState().transact("add", () => {
              useGraphStore.getState().addBlock({
                id: s.id,
                type: "signal.step",
                position: [s.x * 2, s.y * 2],
                rotation: 0,
                mirror: "none",
                params: {},
              });
            });
          }
          for (let i = 0; i < dedupedSpecs.length; i++) {
            useGraphStore.getState().undo();
          }
          expect(useGraphStore.getState().document.model.blocks).toHaveLength(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("setParam: only the targeted param changes", () => {
    const store = useGraphStore.getState();
    store.transact("add", () => {
      store.addBlock({
        id: "b1",
        type: "control.gain",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: { k: 1 },
      });
    });
    store.transact("setParam", () => {
      store.setParam("b1", "k", 5);
    });
    const block = useGraphStore.getState().document.model.blocks.find((b) => b.id === "b1")!;
    expect(block.params.k).toBe(5);
    expect(block.type).toBe("control.gain");
  });

  it("mutateModelAtPath: mutates nested subsystem model only", () => {
    const store = useGraphStore.getState();
    store.loadDocument({
      schema_version: 2,
      model: {
        id: "root",
        name: "Root",
        grid: 10,
        params: [],
        blocks: [
          {
            id: "sub-1",
            type: "hierarchy.subsystem.virtual",
            paradigm: "hierarchy",
            domain: "signal",
            fidelity: "n_a",
            position: [0, 0],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
            subsystem: {
              id: "sub-1-inner",
              name: "Sub",
              grid: 10,
              params: [],
              blocks: [],
              wires: [],
              lines: [],
              nets: [],
              simulation: {},
              metadata: {},
              ports: [],
              parent_param_aliases: [],
            },
          },
        ],
        wires: [],
        lines: [],
        nets: [],
        simulation: {},
        metadata: {},
      },
    });

    store.transact("nested mutate", () => {
      store.mutateModelAtPath(["sub-1"], (model) => {
        model.blocks.push({
          id: "inner-a",
          type: "signal.step",
          paradigm: "signal-flow",
          domain: "signal",
          fidelity: "functional",
          position: [10, 10],
          rotation: 0,
          mirror: "none",
          params: {},
          ic: {},
        });
      });
    });

    const doc = useGraphStore.getState().document;
    const rootIds = doc.model.blocks.map((b) => b.id);
    expect(rootIds).toEqual(["sub-1"]);
    const nested = doc.model.blocks[0]?.subsystem?.blocks.map((b) => b.id);
    expect(nested).toEqual(["inner-a"]);
  });

  it("mutateModelAtPath: invalid path is a no-op", () => {
    const store = useGraphStore.getState();
    const before = structuredClone(store.document);
    store.transact("invalid nested mutate", () => {
      store.mutateModelAtPath(["does-not-exist"], (model) => {
        model.name = "Should not apply";
      });
    });
    expect(useGraphStore.getState().document).toEqual(before);
  });

  it("FE-109: moved-wire reroute keeps untouched endpoint fixed and orthogonal", () => {
    const store = useGraphStore.getState();
    store.loadDocument({
      schema_version: 2,
      model: {
        id: "m1",
        name: "reroute",
        grid: 10,
        params: [],
        blocks: [
          {
            id: "j-a",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [0, 0],
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
            position: [100, 80],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
          {
            id: "j-obstacle",
            type: "routing.junction",
            paradigm: "routing",
            domain: "signal",
            fidelity: "n_a",
            position: [40, 20],
            rotation: 0,
            mirror: "none",
            params: {},
            ic: {},
          },
        ],
        wires: [
          {
            id: "w1",
            from: { block: "j-a", port: "node" },
            to: { block: "j-b", port: "node" },
            waypoints: [
              [20, 0],
              [20, 80],
            ],
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

    store.transact("move source junction", () => {
      store.moveBlocks(["j-a"], [20, 20]);
    });

    const doc = useGraphStore.getState().document.model;
    const wire = doc.wires.find((candidate) => candidate.id === "w1");
    expect(wire).toBeTruthy();
    const points: Array<[number, number]> = [[20, 20], ...(wire?.waypoints ?? []), [100, 80]];

    expect(points[0]).toEqual([20, 20]);
    expect(points[points.length - 1]).toEqual([100, 80]);
    expect(isOrthogonal(points)).toBe(true);
  });
});

/**
 * FE-20 acceptance, end-to-end through `rerouteWiresForBlocks` — the criterion
 * the deleted `cleanup.ts` claimed but never implemented (it read block
 * positions only, never port data).
 */
describe("FE-20: post-move reroute respects each port's facing direction", () => {
  function metadataWithPort(side: "left" | "right" | "top" | "bottom"): BlockMetadata {
    return {
      name: "test.block",
      label: "Test",
      version: 1,
      category: "signal",
      description: "",
      paradigm: "signal",
      domain: "signal",
      fidelities: [],
      ports: {
        inputs: [{ id: "in", label: "in", kind: { domain: "signal" }, side, offset: 20 }],
        outputs: [{ id: "out", label: "out", kind: { domain: "signal" }, side, offset: 20 }],
      },
      params: [],
      symbol: { bbox: [60, 40], shape: "rect" },
      behavior: {
        causality: "causal",
        domain: "signal",
        state_count: 0,
        equation_template: "",
      },
    } as unknown as BlockMetadata;
  }

  function block(id: string, type: string, position: [number, number]): Block {
    return {
      id,
      type,
      paradigm: "signal",
      domain: "signal",
      fidelity: "n_a",
      position,
      rotation: 0,
      mirror: "none",
      params: {},
      ic: {},
    } as unknown as Block;
  }

  it.each([
    ["right" as const, "h" as const],
    ["left" as const, "h" as const],
    ["top" as const, "v" as const],
    ["bottom" as const, "v" as const],
  ])("a %s-facing source port emits a %s first segment after a move", (side, expectedAxis) => {
    useLibraryStore.setState({
      catalog: { "test.src": metadataWithPort(side), "test.dst": metadataWithPort("left") },
    });

    const store = useGraphStore.getState();
    store.loadDocument({
      schema_version: 2,
      model: {
        id: "m1",
        name: "facing",
        grid: 10,
        params: [],
        blocks: [block("src", "test.src", [0, 0]), block("dst", "test.dst", [400, 300])],
        wires: [
          {
            id: "w1",
            from: { block: "src", port: "out" },
            to: { block: "dst", port: "in" },
            // A stale continuation bias pointing along the *other* axis: this is
            // what `inferRouteDir` would have picked, and it must not win.
            waypoints: expectedAxis === "h" ? [[0, 200]] : [[200, 0]],
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

    store.transact("move source", () => {
      store.moveBlocks(["src"], [40, 40]);
    });

    const wire = useGraphStore.getState().document.model.wires.find((w) => w.id === "w1");
    const from = portStubTip("src");
    const to = portStubTip("dst");
    const points: Array<[number, number]> = [from, ...(wire?.waypoints ?? []), to];

    expect(isOrthogonal(points)).toBe(true);
    const a = points[0];
    const b = points[1];
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    if (!a || !b) return;
    expect(a[0] === b[0] ? "v" : "h").toBe(expectedAxis);
  });

  it("a wire also arrives at the destination port along that port's axis", () => {
    // Both ports face horizontally, so a single L cannot satisfy both ends —
    // the router must emit the mid-rail Z.
    useLibraryStore.setState({
      catalog: { "test.src": metadataWithPort("right"), "test.dst": metadataWithPort("left") },
    });

    const store = useGraphStore.getState();
    store.loadDocument({
      schema_version: 2,
      model: {
        id: "m1",
        name: "arrival",
        grid: 10,
        params: [],
        blocks: [block("src", "test.src", [0, 0]), block("dst", "test.dst", [400, 300])],
        wires: [
          {
            id: "w1",
            from: { block: "src", port: "out" },
            to: { block: "dst", port: "in" },
            waypoints: [],
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

    store.transact("move destination", () => {
      store.moveBlocks(["dst"], [40, 40]);
    });

    const wire = useGraphStore.getState().document.model.wires.find((w) => w.id === "w1");
    const points: Array<[number, number]> = [
      portStubTip("src"),
      ...(wire?.waypoints ?? []),
      portStubTip("dst"),
    ];

    expect(isOrthogonal(points)).toBe(true);
    const penultimate = points[points.length - 2];
    const last = points[points.length - 1];
    expect(penultimate).toBeTruthy();
    expect(last).toBeTruthy();
    if (!penultimate || !last) return;
    expect(penultimate[0] === last[0] ? "v" : "h").toBe("h");
  });

  function portStubTip(blockId: string): [number, number] {
    const model = useGraphStore.getState().document.model;
    const target = model.blocks.find((candidate) => candidate.id === blockId);
    if (!target) throw new Error(`missing block ${blockId}`);
    const metadata = useLibraryStore.getState().catalog[target.type];
    if (!metadata) throw new Error(`missing metadata ${target.type}`);
    const portId = blockId === "src" ? "out" : "in";
    const entry = getMetadataPortCenters(target, metadata).find((p) => p.id === portId);
    if (!entry) throw new Error(`missing port ${portId}`);
    return [Math.round(entry.stubTip.x), Math.round(entry.stubTip.y)];
  }
});
