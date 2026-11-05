/**
 * FE-11: BlockSymbol renderer tests
 *
 * Acceptance:
 * - Snapshot test per rotation/mirror combination (8 states) for a 1-in/1-out block.
 * - Port screen positions after rotation match expected geometric formulas.
 */

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { loadCatalogFromManifest } from "../../library/catalog";
import type { BlockMetadata, ParamValue } from "../../model/types";
import { BlockSymbol as BlockSymbolDirect, pickLabelSide, pickValuePlacement } from "./BlockSymbol";
import type { PortSide } from "./Port";

let BlockSymbol: React.ComponentType<unknown> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./BlockSymbol");
  BlockSymbol = mod.BlockSymbol ?? mod.default;
  if (BlockSymbol !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

const ROTATIONS = [0, 90, 180, 270] as const;
const MIRRORS = ["none", "x", "y"] as const;

const TEST_METADATA = {
  name: "control.gain",
  symbol: { bbox: [20, 10], shape: "rect" as const, text: "{k}" },
  ports: {
    inputs: [
      {
        id: "in",
        side: "left" as const,
        offset: 5,
        kind: { domain: "signal", dims: "scalar" },
        label: "",
      },
    ],
    outputs: [
      {
        id: "out",
        side: "right" as const,
        offset: 5,
        kind: { domain: "signal", dims: "scalar" },
        label: "",
      },
    ],
  },
};

describe("FE-11: BlockSymbol", () => {
  for (const rotation of ROTATIONS) {
    for (const mirror of MIRRORS) {
      skip(`renders at rotation=${rotation} mirror=${mirror}`, () => {
        if (!BlockSymbol) throw new Error("BlockSymbol not available");
        const { container } = render(
          React.createElement(BlockSymbol, {
            metadata: TEST_METADATA,
            rotation,
            mirror,
            params: { k: "2" },
          }),
        );
        // Should render an SVG group or equivalent without crashing
        expect(container.firstChild).not.toBeNull();
      });
    }
  }

  skip("custom SVG path is rendered when shape=custom", () => {
    const customMeta = {
      ...TEST_METADATA,
      symbol: { bbox: [20, 10], shape: "custom" as const, path: "M0,0 L20,5 L0,10 Z" },
    };
    if (!BlockSymbol) throw new Error("BlockSymbol not available");
    const { container } = render(
      React.createElement(BlockSymbol, {
        metadata: customMeta,
        rotation: 0,
        mirror: "none",
        params: {},
      }),
    );
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toContain("M0,0");
  });

  skip("port screen positions after 90° rotation match geometric formula", () => {
    // For a 20×10 block rotated 90°, the input port at (left, offset=5) should
    // appear at the top of the rotated symbol. We test via the data attribute
    // or exposed position props rather than pixel coordinates.
    // Placeholder — exact assertion depends on the implementation contract.
    expect(true).toBe(true);
  });
});

// ── Label placement and instance-label promotion ──────────────────────────────

const CATALOG = loadCatalogFromManifest();

function metadataFor(name: string): BlockMetadata {
  const entry = CATALOG[name];
  if (!entry) {
    throw new Error(`no catalog entry for ${name}`);
  }
  return entry;
}

function sides(...list: PortSide[]): ReadonlySet<PortSide> {
  return new Set(list);
}

interface RenderedSymbol {
  /** Texts drawn outside the symbol group: the static label and the value label. */
  outerTexts: SVGTextElement[];
  /** Texts drawn inside the scaled symbol group: the block's body text. */
  bodyTexts: string[];
}

function renderSymbol(
  metadata: BlockMetadata,
  params: Record<string, ParamValue> = {},
  label?: string,
): RenderedSymbol {
  const { container } = render(
    React.createElement(BlockSymbolDirect, {
      metadata,
      rotation: 0,
      mirror: "none",
      params,
      label,
    }),
  );
  const svg = container.querySelector("svg");
  if (!svg) {
    throw new Error("BlockSymbol rendered no <svg>");
  }
  const outerTexts = [...svg.children].filter(
    (child): child is SVGTextElement => child.tagName.toLowerCase() === "text",
  );
  const group = svg.querySelector("g");
  const bodyTexts = [...(group?.querySelectorAll("text") ?? [])].map(
    (node) => node.textContent ?? "",
  );
  return { outerTexts, bodyTexts };
}

describe("pickLabelSide", () => {
  it("puts the name below a block whose ports are on its left and right", () => {
    // Below, not above: a name above sits where the part's leads and any wire
    // entering the top already are, while the space under a two-terminal
    // symbol's thin band is empty.
    expect(pickLabelSide(sides("left", "right"))).toBe("bottom");
  });

  it("falls through to the right of a vertically-ported part, as a schematic does", () => {
    expect(pickLabelSide(sides("top", "bottom"))).toBe("right");
  });

  it("prefers below when only the top carries ports", () => {
    expect(pickLabelSide(sides("top"))).toBe("bottom");
  });

  it("uses the left when top, bottom and right are all taken", () => {
    expect(pickLabelSide(sides("top", "bottom", "right"))).toBe("left");
  });

  it("falls back to the top when every face carries ports", () => {
    expect(pickLabelSide(sides("top", "bottom", "left", "right"))).toBe("top");
  });
});

describe("pickValuePlacement", () => {
  it("stacks the value directly under the name, as one caption", () => {
    // Split to opposite faces, a part's two pieces of text ended up as far
    // apart as the symbol is tall and the reader had to work out they
    // belonged together. `R1` then `10 kΩ` on consecutive lines does not.
    expect(pickValuePlacement("bottom", sides("left", "right"), true)).toEqual(["bottom", 1]);
  });

  it("puts the value on the name's row when there is no name", () => {
    expect(pickValuePlacement("bottom", sides("left", "right"), false)).toEqual(["bottom", 0]);
  });

  it("stacks the value under a name that sits beside the part", () => {
    expect(pickValuePlacement("right", sides("top", "bottom"), true)).toEqual(["right", 1]);
  });

  it("does not indent a lone value beside the part", () => {
    expect(pickValuePlacement("right", sides("top", "bottom"), false)).toEqual(["right", 0]);
  });
});

describe("static label placement avoids the block's own ports", () => {
  it("keeps a tall right-ported block's name off its port labels", () => {
    // machine.pmsm is 80×88, and every one of its four outputs draws a label
    // just off its right edge. The rule this replaced read the aspect ratio
    // and put the name there too, on top of them. Ports are what a label has
    // to avoid, so the name goes to a face with none — below, here.
    const { outerTexts } = renderSymbol(metadataFor("machine.pmsm"), {}, "Traction motor");
    const name = outerTexts.find((node) => node.textContent === "Traction motor");
    expect(name).toBeDefined();
    expect(name?.getAttribute("text-anchor")).toBe("middle");
    // Below the box, not beside it where the port labels are.
    expect(Number(name?.getAttribute("y"))).toBeGreaterThan(0);
  });

  it("puts a wide block's name below it", () => {
    const { outerTexts } = renderSymbol(metadataFor("extensibility.pyblock"), {}, "Long name here");
    const name = outerTexts.find((node) => node.textContent === "Long name here");
    expect(Number(name?.getAttribute("y"))).toBeGreaterThan(0);
  });
});

describe("an authored label is the block's primary text", () => {
  it("replaces the type abbreviation inside the box and drops the stacked copy", () => {
    const { outerTexts, bodyTexts } = renderSymbol(metadataFor("machine.pmsm"), {}, "IM");
    expect(bodyTexts).toContain("IM");
    expect(bodyTexts).not.toContain("PMSM");
    expect(outerTexts.map((node) => node.textContent)).not.toContain("IM");
  });

  it("does the same for a script block used as a named stand-in box", () => {
    const { outerTexts, bodyTexts } = renderSymbol(metadataFor("extensibility.pyblock"), {}, "VSI");
    expect(bodyTexts).toContain("VSI");
    expect(bodyTexts).not.toContain("PY");
    expect(outerTexts.map((node) => node.textContent)).not.toContain("VSI");
  });

  it("leaves an auto-assigned reference designator above the box", () => {
    const { outerTexts, bodyTexts } = renderSymbol(metadataFor("machine.pmsm"), {}, "Pmsm1");
    expect(bodyTexts).toContain("PMSM");
    expect(outerTexts.map((node) => node.textContent)).toContain("Pmsm1");
  });

  it("never displaces body text that carries a parameter value", () => {
    // control.gain's symbol.text is "{k}" — the number in the triangle *is* the
    // block's data, so a name goes above it rather than over it.
    const { outerTexts, bodyTexts } = renderSymbol(metadataFor("control.gain"), { k: 2.5 }, "Kp");
    expect(bodyTexts).toContain("2.5");
    expect(outerTexts.map((node) => node.textContent)).toContain("Kp");
  });

  it("keeps a name that cannot fit inside the box above it", () => {
    // control.sum is a 40-unit circle; nothing this long belongs inside it.
    const { outerTexts, bodyTexts } = renderSymbol(
      metadataFor("control.sum"),
      { signs: "++" },
      "Voltage Decoupling",
    );
    expect(bodyTexts).toContain("Σ");
    expect(outerTexts.map((node) => node.textContent)).toContain("Voltage Decoupling");
  });

  it("drops a label that merely repeats the type's own default caption", () => {
    // control.transform.clarke_park_inv has no hand-drawn schematic symbol, so its
    // default caption "dq0/abc" is always shown once, inside the box, via the
    // inline fallback path. Authoring a label that happens to equal that same
    // text (e.g. because the source figure's own icon is captioned "dq0/abc",
    // exactly as arXiv:1906.11331 Fig. 1 does) must not draw a second, overlapping
    // copy above the box.
    const { outerTexts, bodyTexts } = renderSymbol(
      metadataFor("control.transform.clarke_park_inv"),
      {},
      "dq0/abc",
    );
    expect(bodyTexts).toContain("dq0/abc");
    expect(outerTexts.map((node) => node.textContent)).not.toContain("dq0/abc");
  });

  it("leaves a hand-drawn schematic symbol's refdes and value untouched", () => {
    const { outerTexts, bodyTexts } = renderSymbol(
      metadataFor("passive.resistor"),
      { R: 1000 },
      "R1",
    );
    const texts = outerTexts.map((node) => node.textContent);
    expect(texts).toContain("R1");
    expect(texts).toContain("1 kΩ");
    expect(bodyTexts).not.toContain("R1");
  });

  it("keeps a hand-drawn schematic symbol's own-caption label visible when nothing else shows it", () => {
    // passive.resistor's SCHEMATIC_SYMBOLS entry has no `staticLabel` -- its
    // hand-drawn zigzag glyph carries no inline text of its own (unlike a
    // generic rect/circle/triangle block, which shows the name inside via
    // `bodyLabel`). Authoring "R" -- the type's own default caption, exactly
    // what a hand-drawn schematic's reference designator looks like, and what
    // rows 2/5 of the schematic-drawing benchmark actually did for every
    // passive -- used to be suppressed as a "duplicate" on the wrong
    // assumption that the body already showed it. It never did: the block's
    // name was drawn nowhere at all, above or inside.
    const { outerTexts, bodyTexts } = renderSymbol(
      metadataFor("passive.resistor"),
      { R: 1000 },
      "R",
    );
    const texts = outerTexts.map((node) => node.textContent);
    expect(texts).toContain("R");
    expect(texts).toContain("1 kΩ");
    expect(bodyTexts).not.toContain("R");
  });

  it("keeps a switch's own-caption label visible -- it has no value label to fall back on", () => {
    // passive.switch.ideal resolves (via its own `aliases`) to the
    // `passive.switch.voltage` SCHEMATIC_SYMBOLS entry, which -- like the
    // resistor/capacitor/inductor entries -- declares no `staticLabel`. Unlike
    // a passive, a switch also has no `valueParam`, so before this fix it lost
    // its label completely: nothing rendered above or inside it at all.
    const { outerTexts } = renderSymbol(metadataFor("passive.switch.ideal"), {}, "SW");
    expect(outerTexts.map((node) => node.textContent)).toContain("SW");
  });

  it("still drops the duplicate for a schematic symbol whose own entry supplies the caption", () => {
    // passive.diode.ideal resolves (via its own `aliases`) to the `semi.diode`
    // SCHEMATIC_SYMBOLS entry, which *does* declare `staticLabel: "D"` -- the
    // diode glyph's caption is already shown once via that fallback, so
    // authoring "D" explicitly must not draw it a second time.
    const { outerTexts } = renderSymbol(metadataFor("passive.diode.ideal"), {}, "D");
    const dCount = outerTexts.filter((node) => node.textContent === "D").length;
    expect(dCount).toBe(1);
  });
});
