import type { Block, BlockMetadata } from "../../model/types";
import { resolveBlockBbox, resolveBlockPorts } from "./resolve-ports";

/**
 * Uniform on-canvas magnification for component symbols and their port
 * geometry. Applied consistently to the rendered symbol (BlockSymbol), the
 * ReactFlow handles (BlockNode) and every wire endpoint (all consumers read
 * port centres through getPortCenter), so the body, ports and attached wires
 * stay aligned. Above 1.0 because the authored bboxes (60×40 …) render too
 * small to read the ports clearly.
 *
 * **Why exactly 2, and not 1.6.** Catalog bboxes and port offsets are
 * multiples of 10 (every two-terminal part is 60×40 with its ports at
 * offset 20), and the canvas grid — `router/ortho-route.ts`'s `GRID` — is 20.
 * At 1.6 a port centre landed at 20 × 1.6 = 32 and a part spanned
 * 60 × 1.6 + 2 × STUB_LEN = 128: neither is a multiple of 20, so no port,
 * stub tip or component edge ever coincided with a grid line. Every wire
 * then met its port at an off-grid point, which is what `wire-path.ts`'s
 * six-pixel `ORTHOGONAL_TOLERANCE_PX` and `snapNearOrthogonal` were built to
 * paper over.
 *
 * At 2, with `STUB_LEN` one whole grid unit, the arithmetic closes: an
 * offset of 10/20/30 maps to 20/40/60, a two-terminal part spans
 * 120 + 2 × 20 = 160 = 8 grid units, and every terminal sits on a grid
 * intersection. Keep this an integer multiple that preserves that property
 * if it is ever changed again.
 */
export const SYMBOL_SCALE = 2;

export interface PortDescriptor {
  id: string;
  side: "left" | "right" | "top" | "bottom";
  offset: number;
  /**
   * When set (computed from port.svg_x/svg_y + metadata.symbol.svg_viewbox),
   * these override side+offset for the port's position within the bbox.
   * side is still used for the stub direction in Port.tsx.
   */
  bboxX?: number;
  bboxY?: number;
}

export interface HitTestArgs {
  cursor: { x: number; y: number } | null;
  block: Pick<Block, "id" | "position" | "rotation" | "mirror">;
  port: PortDescriptor;
  bbox: [number, number];
  hitRadius: number;
  zoom: number;
  getPortCenter?: boolean;
}

function basePortCenter(port: PortDescriptor, bbox: [number, number]) {
  // svg_x/svg_y positioning — pre-computed bbox coordinates take priority.
  if (port.bboxX !== undefined && port.bboxY !== undefined) {
    return { x: port.bboxX, y: port.bboxY };
  }
  switch (port.side) {
    case "left":
      return { x: 0, y: port.offset };
    case "right":
      return { x: bbox[0], y: port.offset };
    case "top":
      return { x: port.offset, y: 0 };
    case "bottom":
      return { x: port.offset, y: bbox[1] };
  }
}

function applyMirror(
  point: { x: number; y: number },
  bbox: [number, number],
  mirror: Block["mirror"],
) {
  if (mirror === "x") {
    return { x: point.x, y: bbox[1] - point.y };
  }
  if (mirror === "y") {
    return { x: bbox[0] - point.x, y: point.y };
  }
  return point;
}

function applyRotation(
  point: { x: number; y: number },
  bbox: [number, number],
  rotation: Block["rotation"],
) {
  switch (rotation) {
    case 0:
      return point;
    case 90:
      return { x: bbox[1] - point.y, y: point.x };
    case 180:
      return { x: bbox[0] - point.x, y: bbox[1] - point.y };
    case 270:
      return { x: point.y, y: bbox[0] - point.x };
  }
}

/**
 * Terminal lead length, in canvas units — exactly one grid unit
 * (`router/ortho-route.ts`'s GRID), so a lead tip always lands on a grid
 * intersection. See SYMBOL_SCALE above for why that matters.
 *
 * This is the one definition. `Port.tsx` draws the lead and this module
 * decides where the wire attaches to it, and when the two were separate
 * constants they could drift apart silently: the wire then stopped short of
 * the drawn lead (or ran past it) by the difference, at every terminal on
 * the sheet, with nothing failing.
 */
export const STUB_LEN = 20;

function stubDirection(
  side: PortDescriptor["side"],
  mirror: Block["mirror"],
  rotation: Block["rotation"],
): [number, number] {
  let dx: number;
  let dy: number;
  switch (side) {
    case "left":
      dx = -1;
      dy = 0;
      break;
    case "right":
      dx = 1;
      dy = 0;
      break;
    case "top":
      dx = 0;
      dy = -1;
      break;
    case "bottom":
      dx = 0;
      dy = 1;
      break;
  }
  if (mirror === "x") dy = -dy;
  if (mirror === "y") dx = -dx;
  switch (rotation) {
    case 90:
      [dx, dy] = [-dy, dx];
      break;
    case 180:
      [dx, dy] = [-dx, -dy];
      break;
    case 270:
      [dx, dy] = [dy, -dx];
      break;
  }
  return [dx, dy];
}

function dirToSide(dx: number, dy: number): PortDescriptor["side"] {
  if (dx < 0) return "left";
  if (dx > 0) return "right";
  if (dy < 0) return "top";
  return "bottom";
}

/**
 * The router axis a port on `side` exits along. Left/right ports leave the body
 * horizontally, top/bottom vertically — this is what `routeOrtho` calls
 * `prevDir`, so a wire's first segment leaves perpendicular to the boundary
 * instead of cutting across it.
 */
export function sideToAxis(side: PortDescriptor["side"]): "h" | "v" {
  return side === "left" || side === "right" ? "h" : "v";
}

export function getPortCenter(
  block: Pick<Block, "position" | "rotation" | "mirror">,
  port: PortDescriptor,
  bbox: [number, number],
) {
  const mirrored = applyMirror(basePortCenter(port, bbox), bbox, block.mirror);
  const rotated = applyRotation(mirrored, bbox, block.rotation);
  return {
    x: block.position[0] + rotated.x * SYMBOL_SCALE,
    y: block.position[1] + rotated.y * SYMBOL_SCALE,
  };
}

export function getPortStubTip(
  block: Pick<Block, "position" | "rotation" | "mirror">,
  port: PortDescriptor,
  bbox: [number, number],
) {
  const center = getPortCenter(block, port, bbox);
  const [sdx, sdy] = stubDirection(port.side, block.mirror, block.rotation);
  return {
    x: Math.round(center.x + sdx * STUB_LEN),
    y: Math.round(center.y + sdy * STUB_LEN),
  };
}

export function portHitTest(args: HitTestArgs) {
  const center = getPortCenter(args.block, args.port, args.bbox);
  if (args.getPortCenter || args.cursor === null) {
    return center;
  }

  const radius = args.hitRadius / Math.max(args.zoom, 0.001);
  const dx = args.cursor.x - center.x;
  const dy = args.cursor.y - center.y;
  if (Math.hypot(dx, dy) <= radius) {
    return { blockId: args.block.id, portId: args.port.id, x: center.x, y: center.y };
  }
  return null;
}

/**
 * Convert a port's svg_x/svg_y (in the original SVG viewBox pixel space) to
 * bbox-space coordinates using the xMidYMid meet transform — the same
 * algorithm the browser uses when rendering the SVG with preserveAspectRatio.
 */
function svgToBbox(
  svgX: number,
  svgY: number,
  svgViewbox: [number, number],
  bbox: [number, number],
): { x: number; y: number } {
  const [vw, vh] = svgViewbox;
  const [bw, bh] = bbox;
  const scale = Math.min(bw / vw, bh / vh);
  const ox = (bw - vw * scale) / 2; // horizontal letterbox offset
  const oy = (bh - vh * scale) / 2; // vertical letterbox offset
  return { x: ox + svgX * scale, y: oy + svgY * scale };
}

export function getMetadataPortCenters(block: Block, metadata: BlockMetadata) {
  const svgViewbox = (metadata.symbol as { svg_viewbox?: [number, number] }).svg_viewbox;
  // Port count can depend on the block's own params (control.sum's `signs`, a
  // script block's `input_names`/`output_names`) — see resolve-ports.ts.
  const resolved = resolveBlockPorts(metadata, block.params);
  const bbox = resolveBlockBbox(metadata, block.params);

  return [...resolved.inputs, ...resolved.outputs]
    .filter(
      (port) =>
        (port.side !== undefined && port.offset !== undefined) ||
        (port.svg_x !== undefined && port.svg_y !== undefined),
    )
    .map((port) => {
      let bboxX: number | undefined;
      let bboxY: number | undefined;
      if (port.svg_x !== undefined && port.svg_y !== undefined && svgViewbox) {
        const mapped = svgToBbox(port.svg_x, port.svg_y, svgViewbox, bbox);
        bboxX = mapped.x;
        bboxY = mapped.y;
      }
      const descriptor: PortDescriptor = {
        id: port.id,
        side: port.side ?? "left",
        offset: port.offset ?? 0,
        bboxX,
        bboxY,
      };
      const [sdx, sdy] = stubDirection(descriptor.side, block.mirror, block.rotation);
      const rotatedSide = dirToSide(sdx, sdy);
      return {
        id: port.id,
        side: descriptor.side,
        rotatedSide,
        exitDir: sideToAxis(rotatedSide),
        offset: descriptor.offset,
        center: getPortCenter(block, descriptor, bbox),
        stubTip: getPortStubTip(block, descriptor, bbox),
      };
    });
}

export default portHitTest;
