/**
 * FE-58: SubsystemBlock tests
 *
 * Acceptance:
 * - SubsystemBlock renders with boundary ports from subsystem.ports.
 * - Double-click triggers navigation push.
 * - Enabled subsystem renders extra 'enable' port.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Block } from "../model/types";
import { SubsystemBlock } from "./SubsystemBlock";

afterEach(cleanup);

function makeSubsystemBlock(type: Block["type"] = "hierarchy.subsystem.virtual"): Block {
  return {
    id: "sub-1",
    type,
    paradigm: "hierarchy",
    domain: "signal",
    fidelity: "n_a",
    position: [100, 100],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    subsystem: {
      model: {
        id: "child-1",
        name: "Child",
        grid: 10,
        params: [],
        blocks: [],
        wires: [],
        lines: [],
        nets: [],
      },
      ports: [
        { id: "in1", direction: "in", kind: "signal", boundary_block: "inport-1" },
        { id: "out1", direction: "out", kind: "signal", boundary_block: "outport-1" },
      ],
    },
  } as Block;
}

describe("FE-58: SubsystemBlock", () => {
  it("renders subsystem block with boundary ports", () => {
    render(<SubsystemBlock block={makeSubsystemBlock()} />);

    expect(screen.getByText("in1")).toBeTruthy();
    expect(screen.getByText("out1")).toBeTruthy();
  });

  it("double-click calls onNavigateInto", () => {
    const onNavigateInto = vi.fn();
    render(<SubsystemBlock block={makeSubsystemBlock()} onNavigateInto={onNavigateInto} />);

    fireEvent.doubleClick(screen.getByRole("button", { name: /subsystem/i }));
    expect(onNavigateInto).toHaveBeenCalledWith("sub-1");
  });

  it("enabled subsystem renders enable boundary port", () => {
    render(
      <SubsystemBlock
        block={{
          ...makeSubsystemBlock("hierarchy.subsystem.enabled"),
          params: { enable_port_name: "en" },
        }}
      />,
    );

    expect(screen.getByText("en")).toBeTruthy();
  });
});
