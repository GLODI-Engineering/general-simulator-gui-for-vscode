/**
 * Junction-dot computation.
 *
 * Pure, DOM-free. Coordinates are integer .gsim_sch vertices — no
 * floating-point keys.
 *
 * A junction dot is the only thing on a schematic that distinguishes a
 * connection from a crossing, so under-drawing them is a correctness bug, not
 * a cosmetic one: a reader cannot tell whether two conductors meeting at a
 * point are joined.
 *
 * Two situations need a dot, and the original implementation saw neither of
 * them because it counted *waypoints only*:
 *
 * 1. **Three or more vertices coincide.** Wire endpoints are vertices too —
 *    they are port lead tips — and a three-way node is usually formed by
 *    wires that *end* at the shared point rather than bending there.
 *
 * 2. **A vertex lands in the interior of another wire's segment** (a T). This
 *    is how a rail is tapped: one wire runs straight through, another bends
 *    onto it. Neither wire has three vertices anywhere, so no amount of
 *    vertex counting finds it.
 *
 * A port where *two or more wires* terminate also gets a dot. The component's
 * own lead is a conductor too, so two wires ending on one pin is a three-way
 * node — the capacitor tapping a rail that carries on to the load is the
 * everyday case, and it was coming out undotted while the identical node one
 * component along, formed by a bend instead, was dotted. One wire ending on a
 * pin is an ordinary two-conductor termination and stays undotted; `Port.tsx`
 * already draws the terminal there.
 *
 * **Geometry alone is not enough, and getting this wrong inverts the meaning
 * of the symbol.** All of the above was decided from coordinates only, so two
 * wires carrying entirely unrelated signals got a dot wherever they happened
 * to touch — and a dot does not say "these lines touch", it says "these
 * conductors are one node". On a sheet where a control signal crosses another
 * control signal, that is a drawing which asserts a connection the circuit
 * does not have. It is the same failure class as a silently-wrong netlist,
 * except the reader is the one misled.
 *
 * So every test below is now applied *within one electrical net* and never
 * across two. Two wires are the same net when they share an endpoint — the
 * same `(block, port)`, which is how fan-out from one driver is drawn — or
 * when they carry the same explicit `net` name. Crossings between different
 * nets are left bare, which is exactly what a bare crossing means.
 */

import type { Wire } from "../../model/types";

export interface Junction {
  x: number;
  y: number;
}

export type Point = [number, number];

/** Resolves a wire's two endpoint vertices (its port lead tips). */
export type EndpointResolver = (wire: Wire) => [Point, Point] | null;

function polyline(wire: Wire, endpointsFor?: EndpointResolver): Point[] {
  const middle: Point[] = wire.waypoints.map(([x, y]) => [x, y]);
  const ends = endpointsFor?.(wire);
  if (!ends) {
    return middle;
  }
  return [ends[0], ...middle, ends[1]];
}

/** Is `p` strictly inside the axis-aligned segment `a`–`b` (not at either end)? */
function liesInsideSegment(p: Point, a: Point, b: Point): boolean {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  if (ax === bx) {
    if (px !== ax) return false;
    const lo = Math.min(ay, by);
    const hi = Math.max(ay, by);
    return py > lo && py < hi;
  }
  if (ay === by) {
    if (py !== ay) return false;
    const lo = Math.min(ax, bx);
    const hi = Math.max(ax, bx);
    return px > lo && px < hi;
  }
  // Diagonal segments are not schematic wires; nothing taps one.
  return false;
}

/**
 * Groups wires into electrical nets.
 *
 * Union-find over two relations, both of which really do join conductors:
 * sharing an endpoint `(block, port)` — one driver fanned out to several
 * consumers is drawn as several wires leaving one port — and carrying the
 * same explicit `net` name, which is how a named net joins wires that never
 * touch on the sheet.
 *
 * Sharing a *block* is deliberately not one of them: a resistor's two pins are
 * not the same node, and treating them as one would put a dot at every
 * crossing over a two-terminal part.
 */
function netOf(wires: Wire[]): number[] {
  const parent = wires.map((_, i) => i);
  const find = (start: number): number => {
    let i = start;
    while ((parent[i] as number) !== i) {
      const grand = parent[parent[i] as number] as number;
      parent[i] = grand;
      i = grand;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const byPort = new Map<string, number>();
  const byName = new Map<string, number>();
  wires.forEach((wire, i) => {
    for (const end of [wire.from, wire.to]) {
      const key = `${end.block}\u0000${end.port}`;
      const seen = byPort.get(key);
      if (seen === undefined) byPort.set(key, i);
      else union(seen, i);
    }
    if (wire.net) {
      const seen = byName.get(wire.net);
      if (seen === undefined) byName.set(wire.net, i);
      else union(seen, i);
    }
  });
  return wires.map((_, i) => find(i));
}

export function computeJunctions(wires: Wire[], endpointsFor?: EndpointResolver): Junction[] {
  const nets = netOf(wires);
  const groups = new Map<number, Wire[]>();
  wires.forEach((wire, i) => {
    const id = nets[i] as number;
    const bucket = groups.get(id);
    if (bucket) bucket.push(wire);
    else groups.set(id, [wire]);
  });

  const all = new Map<string, Junction>();
  for (const group of groups.values()) {
    for (const junction of junctionsWithinNet(group, endpointsFor)) {
      all.set(`${junction.x},${junction.y}`, junction);
    }
  }
  return [...all.values()];
}

/** The geometric tests, applied to the wires of a single net. */
function junctionsWithinNet(wires: Wire[], endpointsFor?: EndpointResolver): Junction[] {
  const lines = wires.map((wire) => polyline(wire, endpointsFor));

  const counts = new Map<string, { x: number; y: number; n: number; ends: number }>();
  const bump = (x: number, y: number, isEnd: boolean) => {
    const key = `${x},${y}`;
    const entry = counts.get(key);
    if (entry) {
      entry.n += 1;
      if (isEnd) entry.ends += 1;
    } else {
      counts.set(key, { x, y, n: 1, ends: isEnd ? 1 : 0 });
    }
  };
  for (const line of lines) {
    for (let index = 0; index < line.length; index += 1) {
      const point = line[index];
      if (!point) continue;
      bump(point[0], point[1], index === 0 || index === line.length - 1);
    }
  }

  const found = new Map<string, Junction>();
  for (const { x, y, n, ends } of counts.values()) {
    if (n >= 3 || ends >= 2) {
      found.set(`${x},${y}`, { x, y });
    }
  }

  // T-taps: a vertex of one wire sitting inside a segment of another.
  for (let i = 0; i < lines.length; i += 1) {
    const vertices = lines[i];
    if (!vertices) continue;
    for (const vertex of vertices) {
      const key = `${vertex[0]},${vertex[1]}`;
      if (found.has(key)) continue;
      for (let j = 0; j < lines.length; j += 1) {
        if (i === j) continue;
        const other = lines[j];
        if (!other) continue;
        let tapped = false;
        for (let k = 0; k < other.length - 1; k += 1) {
          const a = other[k];
          const b = other[k + 1];
          if (a && b && liesInsideSegment(vertex, a, b)) {
            tapped = true;
            break;
          }
        }
        if (tapped) {
          found.set(key, { x: vertex[0], y: vertex[1] });
          break;
        }
      }
    }
  }

  return [...found.values()];
}
