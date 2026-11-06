/**
 * Rendering support for SPICE `.SUBCKT` instances (`paradigm: "spice-subckt"`).
 *
 * A subckt instance is an ordinary top-level `Block` whose `subckt_ref` names a
 * `SubcktDef` in `model.subckt_defs`. Its real, wireable ports are that def's
 * `ports[]` — there is no catalog entry for it, so `catalog[block.type]` returns
 * undefined and the block would otherwise render as a dead, handle-less box.
 *
 * Rather than adding a parallel rendering path, we synthesize a `BlockMetadata`
 * from the def. Every downstream consumer (getMetadataPortCenters, BlockNode
 * handle placement, BlockSymbol, wire routing, hit-testing, geometry) is driven
 * purely by a BlockMetadata, so wiring, rotation, mirroring, stub tips and
 * save/load all work unchanged.
 *
 * Three visual states, in order of preference:
 *
 *  1. The def resolves and carries real structured content (`blocks`/`wires`):
 *     the body shows a translucent preview of that internal topology — the
 *     circuit visible "under a cover".
 *  2. The def resolves but has no structured content (an external / netlist-only
 *     subcircuit), or `subckt_ref` names no def at all: a plain box reading
 *     "subcircuit" plus the def's name (or the raw ref). A legitimate state, not
 *     an error.
 *  3. A `spice-subckt` block with no `subckt_ref` at all: unresolvable, handled
 *     by BlockNode's broken-reference fallback.
 */

import type { Block, BlockMetadata, GsfPrimitive, SubcktDef, Wire } from "../model/types";
import { isCausalDomain } from "./edges/wire-color";
import { SYMBOL_SCALE, getMetadataPortCenters } from "./nodes/port-hit-test";

/**
 * The only `spice-subckt.*` block type gsim-core emits today
 * (`SUBCKT_INSTANCE_TYPE` in crates/gsim-core/src/document/builder.rs).
 * Used as a defensive secondary check only — `paradigm` is the discriminator.
 */
export const SUBCKT_INSTANCE_TYPE = "spice-subckt.instance";

/** Body width for a plain (contentless) subcircuit box. */
const PLAIN_WIDTH = 112;
/** Body width when there is internal content to preview — wider, to show it. */
const PREVIEW_WIDTH = 144;
/** Vertical pitch between two ports on the same side. */
const PORT_PITCH = 24;
/** Horizontal pitch between two signal ports along the bottom face. */
const SIGNAL_PORT_PITCH = 34;
/** Minimum body height for a plain box, so a 2-port def still looks like a part. */
const PLAIN_MIN_HEIGHT = 48;
/** Minimum body height when previewing content — needs room for the drawing. */
const PREVIEW_MIN_HEIGHT = 96;
/** Inset between the body outline and the preview drawing. */
const PREVIEW_PAD = 10;
/** Opacity of the "cover" laid over the internal preview. */
const COVER_FILL = "rgba(255, 255, 255, 0.68)";
/** Ink colour of the previewed internals, before the cover is laid over them. */
const PREVIEW_INK = "#475569";

/**
 * Alias kept for readability at call sites: a `SubcktDef` that may carry a
 * `.gsim_sch`-native body (`blocks`/`wires`) rather than only raw SPICE `body`
 * text. Both fields are optional, so a def without them just renders as a
 * plain box.
 */
export type StructuredSubcktDef = SubcktDef;

export function isSubcktInstance(block: Pick<Block, "paradigm" | "type">): boolean {
  return block.paradigm === "spice-subckt" || block.type === SUBCKT_INSTANCE_TYPE;
}

function childBlocks(def: StructuredSubcktDef): Block[] {
  return Array.isArray(def.blocks) ? def.blocks : [];
}

function childWires(def: StructuredSubcktDef): Wire[] {
  return Array.isArray(def.wires) ? def.wires : [];
}

/** True when the def has an internal topology worth previewing. */
export function hasStructuredContent(def: StructuredSubcktDef): boolean {
  return childBlocks(def).length > 0 || childWires(def).length > 0;
}

/** Body height for a def with `portCount` pins: driven by the busier side. */
export function subcktBodyHeight(portCount: number, preview: boolean): number {
  const min = preview ? PREVIEW_MIN_HEIGHT : PLAIN_MIN_HEIGHT;
  return Math.max(min, Math.ceil(portCount / 2) * PORT_PITCH);
}

/**
 * The pseudo-block standing for a def's own boundary inside its body
 * (`SUBCKT_BOUNDARY_TYPE` in gsim-core's `document/subckt.rs`). Wires inside the
 * body connect to it; it is not a component and has no catalog entry.
 */
export const SUBCKT_BOUNDARY_TYPE = "spice-subckt.boundary";

/**
 * Where a wire endpoint actually sits, in the def's own model coordinates.
 *
 * Falls back to the block's position when the port cannot be resolved — an
 * unknown type, or the boundary pseudo-block, which has no catalog entry. A
 * wire drawn to roughly the right place is a better preview than no wire.
 */
function previewPortPoint(
  block: Block,
  catalog: Record<string, BlockMetadata>,
  portId: string,
): [number, number] {
  const metadata = catalog[block.type];
  if (metadata) {
    const hit = getMetadataPortCenters(block, metadata).find((p) => p.id === portId);
    if (hit) {
      return [hit.stubTip.x, hit.stubTip.y];
    }
  }
  return [block.position[0], block.position[1]];
}

interface PreviewShape {
  kind: "block" | "wire";
  points: Array<[number, number]>;
}

/**
 * Collect the def's internal blocks and wires as polylines in the def's own
 * model coordinates, then fit them into the parent body.
 */
function previewPrimitives(
  def: StructuredSubcktDef,
  catalog: Record<string, BlockMetadata>,
  width: number,
  height: number,
): GsfPrimitive[] {
  const shapes: PreviewShape[] = [];

  const blocksById = new Map(childBlocks(def).map((b) => [b.id, b]));

  for (const child of childBlocks(def)) {
    // The boundary pseudo-block is the def's own edge, not a part inside it.
    // Drawing a box for it put a phantom component in every preview.
    if (child.type === SUBCKT_BOUNDARY_TYPE) {
      continue;
    }
    const bbox = catalog[child.type]?.symbol.bbox ?? [60, 40];
    const rotated = child.rotation === 90 || child.rotation === 270;
    const w = (rotated ? bbox[1] : bbox[0]) * SYMBOL_SCALE;
    const h = (rotated ? bbox[0] : bbox[1]) * SYMBOL_SCALE;
    const [x, y] = child.position;
    shapes.push({
      kind: "block",
      points: [
        [x, y],
        [x + w, y + h],
      ],
    });
  }

  // A wire's real path is port -> waypoints -> port. Only its *waypoints* used
  // to be collected here, and most wires have none at all — a straight
  // port-to-port connection carries an empty array — so nearly every wire
  // contributed nothing and the preview came out as a scatter of grey boxes
  // with no connections between them. That is not a preview of a circuit; it
  // is a preview of a parts bin. Resolving both endpoints through the same
  // geometry the real canvas uses is what makes it read as a circuit.
  for (const wire of childWires(def)) {
    const from = blocksById.get(wire.from.block);
    const to = blocksById.get(wire.to.block);
    if (!from || !to) {
      continue;
    }
    const a = previewPortPoint(from, catalog, wire.from.port);
    const b = previewPortPoint(to, catalog, wire.to.port);
    const mids = wire.waypoints.map(([x, y]) => [x, y] as [number, number]);
    shapes.push({ kind: "wire", points: [a, ...mids, b] });
  }

  const all = shapes.flatMap((shape) => shape.points);
  if (all.length === 0) {
    return [];
  }

  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const innerW = width - 2 * PREVIEW_PAD;
  const innerH = height - 2 * PREVIEW_PAD;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  // Centre the fitted drawing inside the body.
  const offsetX = PREVIEW_PAD + (innerW - spanX * scale) / 2;
  const offsetY = PREVIEW_PAD + (innerH - spanY * scale) / 2;
  const project = ([x, y]: [number, number]): [number, number] => [
    Math.round((x - minX) * scale + offsetX),
    Math.round((y - minY) * scale + offsetY),
  ];

  // Wires first, blocks over them — the same stacking the real canvas uses.
  const wires = shapes
    .filter((shape) => shape.kind === "wire")
    .map(
      (shape): GsfPrimitive => ({
        type: "polyline",
        pts: shape.points.map(project),
        lw: 1,
        color: PREVIEW_INK,
      }),
    );
  const blocks = shapes
    .filter((shape) => shape.kind === "block")
    .map((shape): GsfPrimitive => {
      const a = project(shape.points[0] ?? [0, 0]);
      const b = project(shape.points[1] ?? [0, 0]);
      return {
        type: "rect",
        x: a[0],
        y: a[1],
        w: Math.max(b[0] - a[0], 2),
        h: Math.max(b[1] - a[1], 2),
        lw: 1,
        color: PREVIEW_INK,
      };
    });
  return [...wires, ...blocks];
}

function signatureOf(def: StructuredSubcktDef): string {
  return [
    def.id,
    def.name,
    ...def.ports.map((port) => `${port.id}:${port.kind}`),
    "#",
    ...childBlocks(def).map((b) => `${b.id}:${b.type}:${b.position.join(",")}:${b.rotation}`),
    "#",
    // Endpoints are part of the drawing now, so a wire that is re-pointed at a
    // different port must invalidate the cached metadata too.
    ...childWires(def).map(
      (w) =>
        `${w.id}:${w.from.block}.${w.from.port}>${w.to.block}.${w.to.port}:${w.waypoints
          .map((p) => p.join(","))
          .join(";")}`,
    ),
  ].join("|");
}

/**
 * Cache keyed by a structural signature rather than object identity: the graph
 * store `structuredClone`s the model on every mutation, so identity is not
 * stable, while BlockNode's memo comparison compares metadata by reference.
 */
const metadataCache = new Map<string, BlockMetadata>();

function baseMetadata(
  label: string,
  bbox: [number, number],
  ports: BlockMetadata["ports"],
  symbol: BlockMetadata["symbol"],
): BlockMetadata {
  return {
    name: SUBCKT_INSTANCE_TYPE,
    type: SUBCKT_INSTANCE_TYPE,
    label,
    version: 1,
    category: "subsystems",
    description: `SPICE subcircuit instance of ${label}`,
    paradigm: "spice-subckt",
    domain: "physical-electrical",
    fidelities: [],
    ports,
    params: [],
    symbol: { ...symbol, bbox },
    behavior: {
      causality: "acausal",
      domain: "electrical",
      state_count: "dynamic",
      equation_template: "",
    },
  };
}

/** The two centred captions of the plain box: "subcircuit" over the name. */
function plainBoxPrimitives(name: string, width: number, height: number): GsfPrimitive[] {
  return [
    { type: "rect", x: 0, y: 0, w: width, h: height, lw: 1.6 },
    { type: "text", x: width / 2, y: height / 2 - 3, text: "subcircuit", size: 11 },
    { type: "text", x: width / 2, y: height / 2 + 12, text: name, size: 12 },
  ];
}

/**
 * Build a `BlockMetadata` for one `SubcktDef`.
 *
 * Port layout: the def's ports are split in **declaration order** —
 * `ceil(n/2)` on the left, the remainder on the right, top-to-bottom, evenly
 * spaced with a half-step inset. Declaration order must survive to the screen
 * because `.SUBCKT` pins are positional: reading the box against the real
 * `.SUBCKT` card requires the visual order to match the pin order.
 *
 * Left-side ports land in `ports.inputs` and right-side ports in
 * `ports.outputs` purely because that is how BlockMetadata addresses the two
 * sides; subckt pins are acausal and no direction is implied.
 */
export function synthesizeSubcktMetadata(
  def: StructuredSubcktDef,
  catalog: Record<string, BlockMetadata> = {},
): BlockMetadata {
  const signature = signatureOf(def);
  const cached = metadataCache.get(signature);
  if (cached) {
    return cached;
  }

  const ports = def.ports ?? [];
  const preview = hasStructuredContent(def);

  // Split the boundary by paradigm, not by declaration order.
  //
  // This used to be `ports.slice(0, ceil(n/2))` left and the rest right, which
  // put whatever happened to be declared first on the left. A real def mixes
  // both paradigms — `sw_leg` is `(d, s, ctrl_freq, ctrl_phase, ctrl_duty)` —
  // so the halving landed `d, s, ctrl_freq` on the left face and
  // `ctrl_phase, ctrl_duty` on the right: power and control interleaved on
  // both sides of the block. Every control wire then had to loop around the
  // power path to reach it, which is most of why a sheet full of these
  // instances read as spaghetti.
  //
  // Power passes *through* a block, so acausal ports keep the left and right
  // faces. Control arrives from elsewhere on the sheet, so causal ports go to
  // the bottom face, where a control band underneath can feed them with short
  // vertical wires. That is the ordinary power-electronics drawing convention,
  // and it is the same causal/acausal split `Port.tsx` uses to pick a marker
  // shape — one rule, applied to placement as well as to drawing.
  const physical = ports.filter((port) => !isCausalDomain(port.kind));
  const signal = ports.filter((port) => isCausalDomain(port.kind));

  const leftCount = Math.ceil(physical.length / 2);
  const height = subcktBodyHeight(Math.max(leftCount, physical.length - leftCount) * 2, preview);
  // Wide enough that the signal ports along the bottom are not crowded.
  const width = Math.max(preview ? PREVIEW_WIDTH : PLAIN_WIDTH, signal.length * SIGNAL_PORT_PITCH);

  const facePorts = (subset: typeof ports, sideName: "left" | "right" | "bottom", extent: number) =>
    subset.map((port, index) => ({
      id: port.id,
      label: port.id,
      kind: { domain: port.kind },
      side: sideName,
      offset: Math.round(((index + 0.5) * extent) / Math.max(subset.length, 1)),
    }));

  const primitives: GsfPrimitive[] = preview
    ? [
        // Opaque body first, so the canvas grid does not show through the
        // translucent cover and muddle the preview.
        { type: "rectf", x: 0, y: 0, w: width, h: height, color: "#ffffff" },
        ...previewPrimitives(def, catalog, width, height),
        // The "cover": a translucent white wash over the internals, so the
        // circuit reads as a ghosted hint rather than a legible sub-drawing.
        { type: "rectf", x: 1, y: 1, w: width - 2, h: height - 2, color: COVER_FILL },
        // Outline last, so the body edge stays crisp over the wash. Drawn as a
        // closed polyline, not a rect: a `rect` primitive paints an opaque
        // white fill, which would hide the preview underneath it.
        {
          type: "polyline",
          pts: [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height],
            [0, 0],
          ],
          lw: 1.6,
        },
        { type: "text", x: width / 2, y: height / 2 + 4, text: def.name, size: 12 },
      ]
    : plainBoxPrimitives(def.name, width, height);

  const metadata = baseMetadata(
    def.name,
    [width, height],
    {
      // `inputs`/`outputs` here are only the two buckets BlockMetadata carries;
      // a subckt boundary port has no inherent direction, and every consumer
      // concatenates the two anyway (see getMetadataPortCenters).
      inputs: [
        ...facePorts(physical.slice(0, leftCount), "left", height),
        ...facePorts(signal, "bottom", width),
      ],
      outputs: facePorts(physical.slice(leftCount), "right", height),
    },
    { bbox: [width, height], shape: "primitives", primitives },
  );

  metadataCache.set(signature, metadata);
  return metadata;
}

/**
 * A `subckt_ref` that names no def in `model.subckt_defs`. Legitimate for an
 * external / netlist-only subcircuit, so it gets the same plain box — captioned
 * with the raw ref, since no name is available. Portless: the pin list lives on
 * the def, and without the def there is nothing to place.
 */
export function synthesizeUnresolvedSubcktMetadata(ref: string): BlockMetadata {
  const signature = `unresolved|${ref}`;
  const cached = metadataCache.get(signature);
  if (cached) {
    return cached;
  }
  const width = PLAIN_WIDTH;
  const height = PLAIN_MIN_HEIGHT;
  const metadata = baseMetadata(
    ref,
    [width, height],
    { inputs: [], outputs: [] },
    {
      bbox: [width, height],
      shape: "primitives",
      primitives: plainBoxPrimitives(ref, width, height),
    },
  );
  metadataCache.set(signature, metadata);
  return metadata;
}

/**
 * The single metadata lookup for any block on the canvas.
 *
 * Ordinary blocks resolve through the catalog; `spice-subckt` blocks resolve
 * through `subcktDefs`. Returns `null` only when nothing at all can be shown —
 * an unknown catalog type, or a subckt instance carrying no `subckt_ref` —
 * which BlockNode renders as an explicit broken-reference box.
 *
 * Every call site that previously read `catalog[block.type]` must go through
 * this: leaving a bare catalog read on a hit-testing or wiring path yields a
 * block that renders but silently cannot be wired.
 */
export function resolveBlockMetadata(
  block: Pick<Block, "paradigm" | "type" | "subckt_ref">,
  catalog: Record<string, BlockMetadata>,
  subcktDefs?: StructuredSubcktDef[] | null,
): BlockMetadata | null {
  if (isSubcktInstance(block)) {
    const ref = block.subckt_ref;
    if (!ref) {
      return null;
    }
    const def = (subcktDefs ?? []).find((candidate) => candidate.id === ref);
    return def ? synthesizeSubcktMetadata(def, catalog) : synthesizeUnresolvedSubcktMetadata(ref);
  }
  return catalog[block.type] ?? null;
}

export default resolveBlockMetadata;
