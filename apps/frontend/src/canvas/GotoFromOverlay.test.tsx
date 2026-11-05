/**
 * FE-57: GotoFromOverlay tests
 *
 * Acceptance:
 * - Selecting a Goto with two From pairs draws two dotted segments.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GotoFromOverlay } from "./GotoFromOverlay";

afterEach(cleanup);

describe("FE-57: GotoFromOverlay", () => {
  it("test_overlay_paints_dotted: selecting a Goto renders dotted segments to paired Froms", () => {
    const model = {
      blocks: [
        {
          id: "goto1",
          type: "routing.goto",
          params: { tag: "sig", visibility: "global" as const },
          position: [10, 10] as [number, number],
        },
        {
          id: "from1",
          type: "routing.from",
          params: { tag: "sig" },
          position: [80, 20] as [number, number],
        },
        {
          id: "from2",
          type: "routing.from",
          params: { tag: "sig" },
          position: [80, 60] as [number, number],
        },
      ],
    };

    render(<GotoFromOverlay selectedGotoId="goto1" model={model} />);
    const lines = screen.getAllByTestId("goto-from-segment");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.getAttribute("stroke-dasharray")).toBe("4 4");
    }
  });
});
