/**
 * A parent-side subsystem block has to follow its own body.
 *
 * The derivation existed from the start but only ever ran at `Ctrl+G`, so a
 * port added, renamed or deleted inside a body afterwards left the parent
 * unchanged — a sheet that looks right and no longer connects. These tests
 * pin the wiring, not the derivation: that every edit inside a body reaches
 * `syncAncestorSubsystemPorts`, including a parameter edit, which used to
 * address the root sheet whatever the user was looking at.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { Block, Model, ModelDocument, Wire } from "../model/types";
import { useGraphStore } from "./graph";
import { syncAncestorSubsystemPorts } from "./model";
import { useUiStore } from "./ui";

function makeModel(id: string, blocks: Block[] = [], wires: Wire[] = []): Model {
  return {
    id,
    name: id,
    grid: 20,
    params: [],
    blocks,
    wires,
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  };
}

function boundary(id: string, portId: string, outward = false, kind = "signal"): Block {
  return {
    id,
    type: outward ? "hierarchy.outport" : "hierarchy.inport",
    paradigm: "hierarchy",
    domain: "signal",
    fidelity: "n_a",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: { id: portId, kind },
    ic: {},
  };
}

function plainBlock(id: string): Block {
  return {
    id,
    type: "passive.resistor",
    paradigm: "physical-network",
    domain: "physical-electrical",
    fidelity: "ideal",
    position: [200, 200],
    rotation: 0,
    mirror: "none",
    params: { R: 10 },
    ic: {},
  };
}

function subsystem(id: string, inner: Block[], ports: Model["ports"] = []): Block {
  return {
    id,
    type: "hierarchy.subsystem.virtual",
    paradigm: "hierarchy",
    domain: "signal",
    fidelity: "n_a",
    position: [100, 100],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    label: "Subsystem",
    subsystem: { ...makeModel(`${id}-inner`, inner), ports },
  };
}

function wireTo(id: string, block: string, port: string): Wire {
  return {
    id,
    from: { block: "outsider", port: "n" },
    to: { block, port },
    waypoints: [],
    pinned: false,
    net: null,
    kind: "signal",
  };
}

function portsOf(document: ModelDocument, subsystemId: string) {
  return document.model.blocks.find((b) => b.id === subsystemId)?.subsystem?.ports ?? [];
}

describe("syncAncestorSubsystemPorts", () => {
  it("adds a parent port for a boundary block placed inside the body", () => {
    const doc: ModelDocument = {
      schema_version: 2,
      model: makeModel("root", [subsystem("sub", [boundary("in-a", "vin")])]),
    };

    syncAncestorSubsystemPorts(doc, ["sub"]);

    expect(portsOf(doc, "sub")).toEqual([
      { id: "vin", direction: "in", kind: "signal", boundary_block: "in-a" },
    ]);
  });

  it("carries a parent wire over when the port id changes", () => {
    const doc: ModelDocument = {
      schema_version: 2,
      model: makeModel(
        "root",
        [
          subsystem(
            "sub",
            [boundary("in-a", "renamed")],
            [{ id: "old", direction: "in", kind: "signal", boundary_block: "in-a" }],
          ),
        ],
        [wireTo("w1", "sub", "old")],
      ),
    };

    syncAncestorSubsystemPorts(doc, ["sub"]);

    expect(portsOf(doc, "sub")[0]?.id).toBe("renamed");
    expect(doc.model.wires).toHaveLength(1);
    expect(doc.model.wires[0]?.to.port).toBe("renamed");
  });

  it("drops a parent wire whose port no longer exists", () => {
    const doc: ModelDocument = {
      schema_version: 2,
      model: makeModel(
        "root",
        [
          subsystem(
            "sub",
            [],
            [{ id: "gone", direction: "in", kind: "signal", boundary_block: "in-a" }],
          ),
        ],
        [wireTo("w1", "sub", "gone"), wireTo("w2", "elsewhere", "p")],
      ),
    };

    syncAncestorSubsystemPorts(doc, ["sub"]);

    expect(portsOf(doc, "sub")).toEqual([]);
    // The wire that landed on the removed port goes; the unrelated one stays.
    expect(doc.model.wires.map((w) => w.id)).toEqual(["w2"]);
  });

  it("keeps the direction and domain the boundary block declares", () => {
    const doc: ModelDocument = {
      schema_version: 2,
      model: makeModel("root", [
        subsystem("sub", [
          boundary("in-a", "vin", false, "physical-electrical"),
          boundary("out-a", "vout", true, "physical-thermal"),
        ]),
      ]),
    };

    syncAncestorSubsystemPorts(doc, ["sub"]);

    expect(portsOf(doc, "sub")).toEqual([
      { id: "vin", direction: "in", kind: "physical-electrical", boundary_block: "in-a" },
      { id: "vout", direction: "out", kind: "physical-thermal", boundary_block: "out-a" },
    ]);
  });

  it("does nothing for an edit on the root sheet, which has no parent block", () => {
    const doc: ModelDocument = {
      schema_version: 2,
      model: makeModel("root", [plainBlock("r1")]),
    };
    const before = structuredClone(doc);

    syncAncestorSubsystemPorts(doc, []);

    expect(doc).toEqual(before);
  });

  it("updates a nested subsystem two levels down", () => {
    const inner = subsystem("inner", [boundary("in-a", "deep")]);
    const doc: ModelDocument = {
      schema_version: 2,
      model: makeModel("root", [subsystem("outer", [inner])]),
    };

    syncAncestorSubsystemPorts(doc, ["outer", "inner"]);

    const outerBody = doc.model.blocks.find((b) => b.id === "outer")?.subsystem;
    const innerBlock = outerBody?.blocks.find((b) => b.id === "inner");
    expect(innerBlock?.subsystem?.ports).toEqual([
      { id: "deep", direction: "in", kind: "signal", boundary_block: "in-a" },
    ]);
    // `outer` has no boundary blocks of its own, so it gains no ports from a
    // subsystem nested inside it.
    expect(outerBody?.ports).toEqual([]);
  });
});

describe("the graph store keeps a subsystem's ports in step", () => {
  beforeEach(() => {
    useGraphStore.setState(useGraphStore.getInitialState());
    useUiStore.setState(useUiStore.getInitialState());
  });

  function loadWithSubsystem(inner: Block[], ports: Model["ports"] = []) {
    useGraphStore.getState().loadDocument({
      schema_version: 2,
      model: makeModel("root", [subsystem("sub", inner, ports)]),
    });
  }

  it("a boundary block added inside the body appears on the parent", () => {
    loadWithSubsystem([]);
    const graph = useGraphStore.getState();

    graph.transact("add inport", () => {
      useGraphStore.getState().mutateModelAtPath(["sub"], (model) => {
        model.blocks.push(boundary("in-a", "vin"));
      });
    });

    expect(portsOf(useGraphStore.getState().document, "sub")).toEqual([
      { id: "vin", direction: "in", kind: "signal", boundary_block: "in-a" },
    ]);
  });

  it("deleting the boundary block inside removes the parent port", () => {
    loadWithSubsystem(
      [boundary("in-a", "vin")],
      [{ id: "vin", direction: "in", kind: "signal", boundary_block: "in-a" }],
    );

    useGraphStore.getState().transact("delete inport", () => {
      useGraphStore.getState().mutateModelAtPath(["sub"], (model) => {
        model.blocks = model.blocks.filter((b) => b.id !== "in-a");
      });
    });

    expect(portsOf(useGraphStore.getState().document, "sub")).toEqual([]);
  });

  it("renaming a port inside the body renames it on the parent", () => {
    // setParam only ever addressed the root sheet, so this edit used to do
    // nothing at all: the inport lives inside the body, not at the root.
    loadWithSubsystem(
      [boundary("in-a", "in1")],
      [{ id: "in1", direction: "in", kind: "signal", boundary_block: "in-a" }],
    );
    useUiStore.getState().enterSubsystem("sub");

    useGraphStore.getState().transact("set id", () => {
      useGraphStore.getState().setParam("in-a", "id", "vin");
    });

    const body = useGraphStore
      .getState()
      .document.model.blocks.find((b) => b.id === "sub")?.subsystem;
    expect(body?.blocks.find((b) => b.id === "in-a")?.params.id).toBe("vin");
    expect(portsOf(useGraphStore.getState().document, "sub")[0]?.id).toBe("vin");
  });

  it("changing a port's kind inside the body changes the parent port's domain", () => {
    loadWithSubsystem(
      [boundary("in-a", "vin")],
      [{ id: "vin", direction: "in", kind: "signal", boundary_block: "in-a" }],
    );
    useUiStore.getState().enterSubsystem("sub");

    useGraphStore.getState().transact("set kind", () => {
      useGraphStore.getState().setParam("in-a", "kind", "physical-electrical");
    });

    expect(portsOf(useGraphStore.getState().document, "sub")[0]?.kind).toBe("physical-electrical");
  });

  it("still edits a root block by id while the user is inside a body", () => {
    useGraphStore.getState().loadDocument({
      schema_version: 2,
      model: makeModel("root", [plainBlock("r1"), subsystem("sub", [])]),
    });
    useUiStore.getState().enterSubsystem("sub");

    useGraphStore.getState().transact("set R", () => {
      useGraphStore.getState().setParam("r1", "R", 47);
    });

    const root = useGraphStore.getState().document.model;
    expect(root.blocks.find((b) => b.id === "r1")?.params.R).toBe(47);
  });
});
