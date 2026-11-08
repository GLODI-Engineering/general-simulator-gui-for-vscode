/**
 * Resizing a figure's grid tracks by dragging the gap between them.
 *
 * The arithmetic is separated from the pointer handling because it is the
 * part with rules: a drag moves weight from one track to its neighbour and
 * touches nothing else, the total is conserved so the other tracks do not
 * shift, and neither side may collapse to nothing.
 */

/** Below this a plot stops being worth drawing; see GridLayout's MIN_ROW. */
export const MIN_TRACK_PX = 120;

/** Equal tracks, which is how a figure starts. */
export function defaultSizes(count: number): number[] {
  return Array.from({ length: count }, () => 1);
}

/**
 * Make a stored size list usable for `count` tracks.
 *
 * A figure's row count can change (the grid settings dialog) after sizes
 * were stored, so a stale list is trimmed or padded rather than discarded —
 * losing a careful split because one row was added would be worse than an
 * approximate one.
 */
export function normalizeSizes(sizes: number[] | undefined, count: number): number[] {
  if (count <= 0) return [];
  if (!sizes || sizes.length === 0) return defaultSizes(count);
  const usable = sizes.filter((n) => Number.isFinite(n) && n > 0);
  if (usable.length === 0) return defaultSizes(count);
  if (usable.length === count) return usable;
  if (usable.length > count) return usable.slice(0, count);
  const average = usable.reduce((a, b) => a + b, 0) / usable.length;
  return [...usable, ...Array.from({ length: count - usable.length }, () => average)];
}

/**
 * Move `deltaPx` of space from track `index` to track `index + 1`.
 *
 * `totalPx` is the pixel length the tracks share, needed to turn a pointer
 * movement into a fraction. Both neighbours are held at `MIN_TRACK_PX` or
 * above: a drag that would collapse one stops at the limit instead of
 * inverting, which is what makes it safe to drag past the edge.
 */
export function resizeTracks(
  sizes: number[],
  index: number,
  deltaPx: number,
  totalPx: number,
  minPx: number = MIN_TRACK_PX,
): number[] {
  const next = [...sizes];
  const a = next[index];
  const b = next[index + 1];
  if (a === undefined || b === undefined || totalPx <= 0) return next;

  const total = next.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return next;

  // The two neighbours share this much space; the rest of the grid is fixed.
  const pairFraction = a + b;
  const pairPx = (pairFraction / total) * totalPx;
  if (pairPx <= 0) return next;

  // The same floor the CSS enforces, passed in by the caller. Using a
  // different one here makes the drag feel broken: you move the pointer
  // 120px, the arithmetic happily reassigns it, and `minmax()` then clamps
  // it back to 30 — so the gap lags the pointer for no visible reason.
  const minFraction = (minPx / pairPx) * pairFraction;
  if (minFraction * 2 >= pairFraction) return next; // no room to move at all

  const deltaFraction = (deltaPx / pairPx) * pairFraction;
  const wanted = a + deltaFraction;
  const clamped = Math.min(pairFraction - minFraction, Math.max(minFraction, wanted));

  next[index] = clamped;
  next[index + 1] = pairFraction - clamped;
  return next;
}

/** The CSS `grid-template-*` value for these tracks. */
export function trackTemplate(sizes: number[], minPx: number, splitterPx: number): string {
  return sizes.map((size) => `minmax(${minPx}px, ${size}fr)`).join(` ${splitterPx}px `);
}
