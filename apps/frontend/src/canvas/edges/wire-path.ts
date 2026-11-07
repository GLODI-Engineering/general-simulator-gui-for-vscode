export type WirePoint = [number, number];

export function buildWirePoints(
  source: { x: number; y: number },
  waypoints: WirePoint[],
  target: { x: number; y: number },
): WirePoint[] {
  return [
    [Math.round(source.x), Math.round(source.y)],
    ...waypoints.map(([x, y]): WirePoint => [Math.round(x), Math.round(y)]),
    [Math.round(target.x), Math.round(target.y)],
  ];
}

/**
 * FE-156: a wire's stored waypoints are computed independently of whatever
 * ReactFlow reports as the connected nodes' actual handle position (e.g.
 * insertBuckSchematic()'s own getMetadataPortCenters() math vs ReactFlow's
 * rendered handle) — the two rarely land on the *exact* same pixel, off by
 * a few px even for a perfectly valid, intentionally-orthogonal wire. Before
 * this tolerance, that trivial mismatch flipped `isOrthogonalPolyline` to
 * false and made WireEdge treat the whole wire as invalid (dashed red reject
 * styling) — previously masked because a separate bug (see WireEdge.tsx)
 * meant colors/widths didn't render as authored at all, so nobody noticed.
 * A small tolerance absorbs that class of near-miss while still catching
 * genuinely diagonal/broken waypoint data (real mismatches run to tens or
 * hundreds of px, not a handful).
 */
const ORTHOGONAL_TOLERANCE_PX = 6;

export function isOrthogonalPolyline(points: WirePoint[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) {
      return false;
    }
    const dx = Math.abs(current[0] - next[0]);
    const dy = Math.abs(current[1] - next[1]);
    if (dx > ORTHOGONAL_TOLERANCE_PX && dy > ORTHOGONAL_TOLERANCE_PX) {
      return false;
    }
  }
  return true;
}

/**
 * `isOrthogonalPolyline`'s tolerance decides whether a wire is *valid* (not
 * reject-styled) — it does not change what gets drawn. Left alone, a segment
 * that passed only because it's within tolerance (say dx=4, dy=280) was still
 * rendered as that exact, still-slightly-diagonal straight line: a small but
 * visible lean before the wire "goes straight," at every one of these
 * near-miss segments. This snaps each near-miss axis to exact, chaining
 * forward through the polyline so segment N's snap is measured from segment
 * N-1's already-snapped point, the same order the path is actually drawn in.
 * A segment whose *both* axes are within tolerance (a near-zero-length stub)
 * snaps to horizontal — an arbitrary but consistent choice, since there is no
 * visible line to get wrong either way.
 */
/**
 * Only the segment touching a *live* endpoint (points[0] or the last point — ReactFlow's own
 * rendered handle position, computed independently of the router, see the FE-156 note above)
 * ever needs tolerance-based correction: every interior point is a stored, already-`Math.round`ed
 * waypoint the router placed exactly, so a middle segment (between two interior points) is
 * already exact and is left untouched. The two live endpoints themselves are never moved —
 * moving either would visibly detach the wire from the port it's drawn to touch.
 *
 * For a segment adjacent to a live endpoint, only the *other* point (an interior waypoint, or
 * the opposite live endpoint for a plain 2-point wire) gets adjusted, and only the axis that
 * was already near-zero: whichever of dx/dy is smaller gets snapped to match the live endpoint
 * exactly, and the larger one's real movement is kept. This is what makes the common
 * one-waypoint case work correctly even when *both* ends independently want a near-miss fix
 * (the interior point ends up with one axis pinned to the source, the other pinned to the
 * target — a real L-bend — rather than either correction accidentally discarding the other's).
 */
export function snapNearOrthogonal(points: WirePoint[]): WirePoint[] {
  if (points.length < 2) {
    return points;
  }
  const snapped: WirePoint[] = points.map((p) => [p[0], p[1]]);
  const last = snapped.length - 1;

  const snapToward = (liveIndex: number, otherIndex: number) => {
    const live = snapped[liveIndex];
    const other = snapped[otherIndex];
    if (!live || !other) {
      return;
    }
    const dx = Math.abs(other[0] - live[0]);
    const dy = Math.abs(other[1] - live[1]);
    if (dx === 0 || dy === 0) {
      return; // already exact on at least one axis — nothing to correct
    }
    if (dx <= dy) {
      snapped[otherIndex] = [live[0], other[1]];
    } else {
      snapped[otherIndex] = [other[0], live[1]];
    }
  };

  snapToward(0, 1);
  if (last > 1) {
    snapToward(last, last - 1);
  }
  return snapped;
}

export function wireSvgPath(points: WirePoint[]): string {
  if (points.length === 0) {
    return "";
  }
  const [first, ...rest] = points;
  if (!first) {
    return "";
  }
  return [`M ${first[0]} ${first[1]}`, ...rest.map(([x, y]) => `L ${x} ${y}`)].join(" ");
}

/**
 * Build an L-shaped orthogonal path between two points with no stored waypoints.
 * Uses horizontal-first routing (go to target-x at source-y, then drop to target-y).
 * This avoids rendering diagonal wires when the router's waypoints don't exactly
 * match the ReactFlow handle positions.
 */
export function autoOrthogonalPath(source: WirePoint, target: WirePoint): string {
  const [sx, sy] = source;
  const [tx, ty] = target;
  if (sx === tx || sy === ty) {
    // Already horizontal or vertical — straight line is orthogonal.
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }
  // Elbow at (tx, sy): go horizontal to target column, then vertical to target row.
  return `M ${sx} ${sy} L ${tx} ${sy} L ${tx} ${ty}`;
}

/**
 * The wire path, with a small arc wherever it steps over a wire it is not
 * connected to.
 *
 * The arc always bulges the same way along the direction of travel, so a wire
 * crossing five others reads as one line hopping five times rather than as a
 * line that wanders. Hops that fall too close to a corner are dropped: an arc
 * that ran into a bend would distort the corner, and a corner is load-bearing
 * -- it is how the eye follows the wire.
 */
export function wireSvgPathWithHops(
  points: WirePoint[],
  hops: Array<{ at: WirePoint }>,
  radius: number,
): string {
  if (points.length === 0) {
    return "";
  }
  if (hops.length === 0) {
    return wireSvgPath(points);
  }
  const first = points[0];
  if (!first) {
    return "";
  }
  const out = [`M ${first[0]} ${first[1]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const horizontal = a[1] === b[1];
    const along = horizontal ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
    const start = horizontal ? a[0] : a[1];
    const end = horizontal ? b[0] : b[1];

    const onThis = hops
      .filter(({ at }) => {
        const across = horizontal ? at[1] : at[0];
        const position = horizontal ? at[0] : at[1];
        if (across !== (horizontal ? a[1] : a[0])) return false;
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        // Clear of both ends by a whole arc, so no corner is eaten.
        return position - radius > lo && position + radius < hi;
      })
      .map(({ at }) => (horizontal ? at[0] : at[1]))
      .sort((m, n) => (along > 0 ? m - n : n - m));

    for (const position of onThis) {
      const before = position - radius * along;
      const after = position + radius * along;
      // Sweep is chosen from the direction of travel so the bulge stays on
      // the same side of the wire whichever way the wire runs.
      const sweep = horizontal ? (along > 0 ? 1 : 0) : along > 0 ? 0 : 1;
      if (horizontal) {
        out.push(`L ${before} ${a[1]}`);
        out.push(`A ${radius} ${radius} 0 0 ${sweep} ${after} ${a[1]}`);
      } else {
        out.push(`L ${a[0]} ${before}`);
        out.push(`A ${radius} ${radius} 0 0 ${sweep} ${a[0]} ${after}`);
      }
    }
    out.push(`L ${b[0]} ${b[1]}`);
  }
  return out.join(" ");
}
