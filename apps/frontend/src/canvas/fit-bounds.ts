import type { Block, BlockMetadata, Wire } from "../model/types";
import { getBlockBoundingBox } from "./geometry";
import { STUB_LEN } from "./nodes/port-hit-test";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Margin left around the drawing when framing it, in model units. One grid
 * unit of air on every side: enough that a label or a lead tip does not sit
 * flush against the edge, little enough that the sheet still fills the view.
 */
export const FIT_PADDING = STUB_LEN;

/**
 * The rectangle that actually has ink in it.
 *
 * ReactFlow's own `fitView` frames *nodes*. On a block diagram that is the
 * whole picture, because every edge runs between two node boxes. On a
 * schematic it is not: a return rail is a wire that leaves the bottom of one
 * part, runs along below every other part, and comes back up — entirely
 * outside the union of the node boxes. Framing by nodes alone cropped it, so
 * a rendered buck converter lost the rail its whole lower half hangs from.
 *
 * So the bounds are the union of three things: the node boxes, the terminal
 * leads that stick out one grid unit past them, and every wire waypoint.
 * Wire *endpoints* need no special handling — they are port lead tips, which
 * the expanded node boxes already cover.
 */
export function schematicBounds(
  blocks: Block[],
  wires: Wire[],
  metadataFor: (block: Block) => BlockMetadata | null,
): Rect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const block of blocks) {
    const box = getBlockBoundingBox(block, metadataFor(block));
    // Leads project one grid unit beyond the body on whichever faces carry
    // ports; expanding all four is a unit too generous on a bare face and
    // saves resolving every port's side just to frame the sheet.
    include(box.x - STUB_LEN, box.y - STUB_LEN);
    include(box.x + box.width + STUB_LEN, box.y + box.height + STUB_LEN);
  }

  for (const wire of wires) {
    for (const [x, y] of wire.waypoints ?? []) {
      include(x, y);
    }
  }

  if (!Number.isFinite(minX)) {
    return null;
  }

  return {
    x: minX - FIT_PADDING,
    y: minY - FIT_PADDING,
    width: maxX - minX + FIT_PADDING * 2,
    height: maxY - minY + FIT_PADDING * 2,
  };
}
