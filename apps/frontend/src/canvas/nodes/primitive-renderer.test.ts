import { describe, expect, it } from "vitest";

import type { BlockMetadata } from "../../model/types";
import { metadataToPrimitives } from "./primitive-renderer";

// FE-103 — Catalog-driven primitive symbol renderer (replace hardcoded DEFS)
// Scaffold-only tests. Implement full assertions from progress.frontend.yaml acceptance bullets.
// Acceptance checklist:
// - test_canvas_svg_parity: a fixed primitive list produces matching geometry in canvas calls and SVG output.
// - test_all_primitive_kinds: each primitive kind renders without throwing.
// - test_metadata_sourced: rendering a catalog block uses its metadata symbol, with no fallback to a hardcoded table.

describe("FE-103 scaffold", () => {
  it.todo("implement acceptance coverage");
});

// FE-170 — metadataToPrimitives() support for symbol.shape: "primitives" (GSF)
function makeMetadata(symbol: BlockMetadata["symbol"]): BlockMetadata {
  return {
    behavior: { causality: "causal", domain: "signal", equation_template: "x", state_count: 0 },
    category: "control",
    description: "d",
    domain: "signal",
    fidelities: [],
    label: "L",
    name: "control.x",
    paradigm: "signal-flow",
    params: [],
    ports: { inputs: [], outputs: [] },
    symbol,
    version: 1,
  };
}

describe("FE-170: metadataToPrimitives() — symbol.shape: primitives", () => {
  it("returns symbol.primitives verbatim", () => {
    const metadata = makeMetadata({
      bbox: [40, 40],
      shape: "primitives",
      primitives: [
        { type: "rect", x: 0, y: 0, w: 40, h: 40 },
        { type: "circle", cx: 20, cy: 20, r: 5 },
        { type: "line", x1: 0, y1: 0, x2: 40, y2: 40 },
      ],
    });

    const prims = metadataToPrimitives(metadata);

    expect(prims).toEqual([
      { type: "rect", x: 0, y: 0, w: 40, h: 40 },
      { type: "circle", cx: 20, cy: 20, r: 5 },
      { type: "line", x1: 0, y1: 0, x2: 40, y2: 40 },
    ]);
  });

  it("appends a text primitive when symbol.text is set, matching the other shape branches", () => {
    const metadata = makeMetadata({
      bbox: [40, 40],
      shape: "primitives",
      primitives: [{ type: "rect", x: 0, y: 0, w: 40, h: 40 }],
      text: "Q",
    });

    const prims = metadataToPrimitives(metadata);

    expect(prims).toHaveLength(2);
    expect(prims[1]).toMatchObject({ type: "text", text: "Q" });
  });

  it("returns an empty body (no throw) when primitives is absent", () => {
    const metadata = makeMetadata({ bbox: [40, 40], shape: "primitives" });

    expect(metadataToPrimitives(metadata)).toEqual([]);
  });

  it("leaves the existing rect/circle/triangle/custom branches unchanged", () => {
    expect(metadataToPrimitives(makeMetadata({ bbox: [20, 10], shape: "rect" }))).toEqual([
      { type: "rect", x: 0, y: 0, w: 20, h: 10 },
    ]);
    expect(
      metadataToPrimitives(makeMetadata({ bbox: [10, 10], shape: "custom", path: "M0,0" })),
    ).toEqual([]);
  });
});

describe("metadataToPrimitives() — body-text override", () => {
  it("draws the supplied text in place of the type's own symbol.text", () => {
    const metadata = makeMetadata({ bbox: [80, 40], shape: "rect", text: "PY" });

    const prims = metadataToPrimitives(metadata, {}, { text: "VSI" });

    expect(prims).toHaveLength(2);
    expect(prims[1]).toMatchObject({ type: "text", text: "VSI", x: 40, y: 20 });
  });

  it("draws body text for a type that declares none, when one is supplied", () => {
    const metadata = makeMetadata({ bbox: [80, 40], shape: "rect" });

    expect(metadataToPrimitives(metadata, {}, { text: "Observer" })[1]).toMatchObject({
      type: "text",
      text: "Observer",
    });
  });

  it("keeps interpolating symbol.text when no override is given", () => {
    const metadata = makeMetadata({ bbox: [80, 40], shape: "rect", text: "{k}" });

    expect(metadataToPrimitives(metadata, { k: 7 })[1]).toMatchObject({ type: "text", text: "7" });
  });
});
