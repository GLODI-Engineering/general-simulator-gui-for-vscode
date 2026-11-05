import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import type { Block, Model } from "../model/types";
import { Breadcrumb } from "./Breadcrumb";
import { SubsystemBlock } from "./SubsystemBlock";
import { createNavStore } from "./hierarchy-nav";

function makeEmptyModel(id: string): Model {
  return {
    id,
    name: id,
    grid: 10,
    params: [],
    blocks: [],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
  };
}

function makeSubsystemBlock(id: string, label?: string): Block {
  return {
    id,
    type: "hierarchy.subsystem.atomic",
    paradigm: "hierarchy",
    domain: "signal",
    fidelity: "n_a",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    label,
    subsystem: makeEmptyModel(`${id}-inner`),
  };
}

describe("FE-58: hierarchy navigation", () => {
  it("test_hierarchy_nav_push: double-click on subsystem pushes id to path stack", () => {
    const nav = createNavStore();
    const subsystem = makeSubsystemBlock("sub-1", "Sub 1");

    render(
      React.createElement(SubsystemBlock, {
        block: subsystem,
        onNavigateInto: (blockId: string) => {
          nav.push(blockId);
        },
      }),
    );

    fireEvent.doubleClick(screen.getByRole("button", { name: /subsystem: sub 1/i }));

    expect(nav.path).toEqual(["sub-1"]);
  });

  it("test_hierarchy_nav_pop_to_crumb: clicking first crumb returns to root", () => {
    const nav = createNavStore();
    nav.push("sub-1");
    nav.push("sub-2");

    const blocks: Block[] = [
      makeSubsystemBlock("sub-1", "Sub 1"),
      makeSubsystemBlock("sub-2", "Sub 2"),
    ];

    render(
      React.createElement(Breadcrumb, {
        path: nav.path,
        blocks,
        onNavigate: (index: number) => {
          nav.popTo(index);
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Root" }));

    expect(nav.path).toEqual([]);
  });
});
