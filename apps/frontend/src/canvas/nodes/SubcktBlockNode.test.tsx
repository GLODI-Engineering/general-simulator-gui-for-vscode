/**
 * A spice-subckt instance must render as a real, wireable component: the def's
 * name on the body and one ReactFlow Handle per SubcktDef pin. Before the
 * resolver existed this rendered as a bare text div with zero handles.
 */

import { render } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import { describe, expect, it } from "vitest";

import type { Block } from "../../model/types";
import { type StructuredSubcktDef, resolveBlockMetadata } from "../subckt-metadata";
import BlockNode from "./BlockNode";

const DEF: StructuredSubcktDef = {
  id: "opamp_def",
  name: "OPAMP",
  ports: [
    { id: "inp", kind: "physical-electrical" },
    { id: "inn", kind: "physical-electrical" },
    { id: "vcc", kind: "physical-electrical" },
    { id: "vee", kind: "physical-electrical" },
    { id: "out", kind: "physical-electrical" },
  ],
  body: "",
};

const BLOCK: Block = {
  id: "X1",
  type: "spice-subckt.instance",
  paradigm: "spice-subckt",
  domain: "physical-electrical",
  fidelity: "spice",
  position: [200, 120],
  rotation: 0,
  mirror: "none",
  params: {},
  ic: {},
  subckt_ref: "opamp_def",
};

function renderNode(block: Block, defs: StructuredSubcktDef[]) {
  const metadata = resolveBlockMetadata(block, {}, defs);
  return render(
    <ReactFlowProvider>
      <BlockNode
        id={block.id}
        type="block"
        data={{ block, metadata }}
        selected={false}
        zIndex={0}
        isConnectable={false}
        xPos={block.position[0]}
        yPos={block.position[1]}
        dragging={false}
      />
    </ReactFlowProvider>,
  );
}

describe("subckt instance rendering", () => {
  it("renders one handle pair per SubcktDef pin, in declaration order", () => {
    const { container } = renderNode(BLOCK, [DEF]);
    const handles = [...container.querySelectorAll(".react-flow__handle")];
    // Every port gets a source and a target handle (see BlockNode).
    expect(handles).toHaveLength(DEF.ports.length * 2);
    const ids = handles.map((h) => h.getAttribute("data-handleid"));
    for (const port of DEF.ports) {
      expect(ids).toContain(port.id);
    }
  });

  it("labels the body with the def's name and each port with its own id", () => {
    const { container } = renderNode(BLOCK, [DEF]);
    const text = container.textContent ?? "";
    expect(text).toContain("OPAMP");
    expect(text).toContain("subcircuit");
    for (const port of DEF.ports) {
      expect(text).toContain(port.id);
    }
  });

  it("places the first three pins on the left edge and the rest on the right", () => {
    const metadata = resolveBlockMetadata(BLOCK, {}, [DEF]);
    expect(metadata?.ports.inputs.map((p) => p.id)).toEqual(["inp", "inn", "vcc"]);
    expect(metadata?.ports.outputs.map((p) => p.id)).toEqual(["vee", "out"]);
  });

  it("falls back to an explicit broken-state box when subckt_ref is missing", () => {
    const { subckt_ref, ...withoutRef } = BLOCK;
    const { container } = renderNode(withoutRef as Block, [DEF]);
    expect(container.querySelector(".canvas-node--broken")).not.toBeNull();
    expect(container.textContent).toContain("missing subckt_ref");
    expect(container.querySelectorAll(".react-flow__handle")).toHaveLength(0);
  });

  it("still renders a named box when subckt_ref names no def", () => {
    const { container } = renderNode({ ...BLOCK, subckt_ref: "ghost" }, []);
    expect(container.querySelector(".canvas-node--broken")).toBeNull();
    expect(container.textContent).toContain("ghost");
    expect(container.textContent).toContain("subcircuit");
  });
});
