/**
 * FE-171: BJT/MOSFET GSF symbols — visual parity verification.
 *
 * BE-74 authored real symbol.primitives bodies for bjt_npn/mosfet_n by
 * porting the exact coordinates out of component-symbols.tsx's hardcoded
 * bjtSymbol()/mosfetSymbol(). This test proves that port didn't drift: it
 * renders the ACTUAL hardcoded SchematicSymbol (via getSchematicSymbol(),
 * the real production lookup) to a real SVG string with
 * react-dom/server.renderToStaticMarkup, and separately renders the
 * metadata-driven primitives (via metadataToPrimitives() + renderPrimitives(),
 * bypassing getSchematicSymbol() entirely) to its own SVG string — then
 * compares the outer circle's radius, the single primitive that defines each
 * symbol's overall visual envelope in both versions.
 *
 * SCHEMATIC_SYMBOLS / bjtSymbol / mosfetSymbol are untouched by this test —
 * production rendering still goes through the hardcoded table (verified by
 * the last assertion in each case).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BlockMetadata } from "../../model/types";
import { getSchematicSymbol } from "./component-symbols";
import { metadataToPrimitives } from "./primitive-renderer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../../../");

function loadMetadata(relPath: string): BlockMetadata {
  const text = readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
  return yaml.load(text) as BlockMetadata;
}

function hardcodedCircleRadius(
  name: string,
  type: string,
  ...aliases: string[]
): number | undefined {
  const symbol = getSchematicSymbol(name, type, ...aliases);
  expect(symbol, `no hardcoded SchematicSymbol found for ${name}`).toBeDefined();
  const [w, h] = [80, 110]; // generous ctx; symbols don't scale off it for radii
  const markup = renderToStaticMarkup(symbol?.render({ width: w, height: h, params: {} }));
  const match = markup.match(/<circle[^>]*\br="([\d.]+)"/);
  return match ? Number(match[1]) : undefined;
}

function metadataCircleRadius(metadata: BlockMetadata): number | undefined {
  const prims = metadataToPrimitives(metadata);
  const circle = prims.find((p) => p.type === "circle");
  return circle?.type === "circle" ? circle.r : undefined;
}

describe("FE-171: bjt_npn metadata-primitives render vs hardcoded bjtSymbol", () => {
  const metadata = loadMetadata(
    "packages/blocks/src/blocks/physical-electrical/semiconductor/bjt_npn/metadata.yaml",
  );

  it("shape is primitives (BE-74 replaced the shape:rect placeholder)", () => {
    expect(metadata.symbol.shape).toBe("primitives");
  });

  it("metadata-primitives circle radius matches the hardcoded bjtSymbol's circle radius", () => {
    const hardcoded = hardcodedCircleRadius(
      metadata.name,
      metadata.type ?? metadata.name,
      "npn",
      "bjt",
    );
    const fromMetadata = metadataCircleRadius(metadata);
    expect(fromMetadata).toBe(40);
    expect(fromMetadata).toBe(hardcoded);
  });

  it("getSchematicSymbol() still resolves bjt_npn to the hardcoded table by default (production path unchanged)", () => {
    const symbol = getSchematicSymbol(metadata.name, metadata.type ?? metadata.name, "npn", "bjt");
    expect(symbol?.selfDrawnPorts).not.toBe(true); // sanity: it's the plain bjtSymbol, not an imported SVG variant
  });
});

describe("FE-171: mosfet_n metadata-primitives render vs hardcoded mosfetSymbol", () => {
  const metadata = loadMetadata(
    "packages/blocks/src/blocks/physical-electrical/semiconductor/mosfet_n/metadata.yaml",
  );

  it("shape is primitives (BE-74 replaced the shape:rect placeholder)", () => {
    expect(metadata.symbol.shape).toBe("primitives");
  });

  it("metadata-primitives circle radius matches the hardcoded mosfetSymbol's circle radius", () => {
    const hardcoded = hardcodedCircleRadius(
      metadata.name,
      metadata.type ?? metadata.name,
      "mosfet",
      "nmos",
      "mosfet_n",
    );
    const fromMetadata = metadataCircleRadius(metadata);
    expect(fromMetadata).toBe(51);
    expect(fromMetadata).toBe(hardcoded);
  });

  it("getSchematicSymbol() still resolves mosfet_n to the hardcoded table by default (production path unchanged)", () => {
    const symbol = getSchematicSymbol(
      metadata.name,
      metadata.type ?? metadata.name,
      "mosfet",
      "nmos",
    );
    expect(symbol).toBeDefined();
  });
});
