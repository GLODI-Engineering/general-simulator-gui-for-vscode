/**
 * FE-100: Junction-dot computation.
 *
 * Pure, DOM-free. A junction is any integer grid point shared by three or more
 * wire vertices (across all wires and within a wire). Ported from the reference
 * editor `schematic_editor.html` (computeJunctions). Coordinates are the integer
 * .gsim_sch wire vertices — no floating-point keys.
 */

import type { Wire } from "../../model/types";

export interface Junction {
  x: number;
  y: number;
}

export function computeJunctions(wires: Wire[]): Junction[] {
  const counts = new Map<string, { x: number; y: number; n: number }>();
  for (const wire of wires) {
    for (const [x, y] of wire.waypoints) {
      const key = `${x},${y}`;
      const entry = counts.get(key);
      if (entry) {
        entry.n += 1;
      } else {
        counts.set(key, { x, y, n: 1 });
      }
    }
  }
  const junctions: Junction[] = [];
  for (const { x, y, n } of counts.values()) {
    if (n >= 3) {
      junctions.push({ x, y });
    }
  }
  return junctions;
}
