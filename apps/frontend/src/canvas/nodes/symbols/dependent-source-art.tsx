/**
 * Shared artwork for the four dependent sources.
 *
 * A dependent source is a **diamond** in IEC 60617 / IEEE 315 — that is what
 * distinguishes it at a glance from an independent source, which is a circle.
 * The previous artwork drew a circle, so a VCVS and a battery read the same,
 * and a reader had to go to the label to tell a controlled source from a
 * supply.
 *
 * The output is drawn as a horizontal series element, because that is how
 * these are placed: the E/F pair that models an ideal transformer sits in
 * series in a branch. The controlling quantity is sensed from below, so the
 * sense port never competes with the series path for the same edge.
 */
import type { ReactNode } from "react";

import { FILL, STROKE, SW } from "../symbol-drawing";

/** Half-width and half-height of the diamond, about its centre. */
const RX = 24;
const RY = 22;

export interface DiamondArt {
  /** Centre of the diamond; also the height of the series path. */
  cx: number;
  cy: number;
  /** Where the series leads start and end. */
  width: number;
}

export function diamond({ cx, cy, width }: DiamondArt): ReactNode {
  return (
    <>
      <line x1={0} y1={cy} x2={cx - RX} y2={cy} stroke={STROKE} strokeWidth={SW} />
      <line x1={cx + RX} y1={cy} x2={width} y2={cy} stroke={STROKE} strokeWidth={SW} />
      <polygon
        points={`${cx - RX},${cy} ${cx},${cy - RY} ${cx + RX},${cy} ${cx},${cy + RY}`}
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
    </>
  );
}

/** `+` over `−`: this source impresses a voltage. */
export function voltageMarks(cx: number, cy: number): ReactNode {
  return (
    <>
      <line x1={cx - 5} y1={cy - 11} x2={cx + 5} y2={cy - 11} stroke={STROKE} strokeWidth={SW} />
      <line x1={cx} y1={cy - 16} x2={cx} y2={cy - 6} stroke={STROKE} strokeWidth={SW} />
      <line x1={cx - 5} y1={cy + 12} x2={cx + 5} y2={cy + 12} stroke={STROKE} strokeWidth={SW} />
    </>
  );
}

/** An arrow along the series path: this source impresses a current. */
export function currentArrow(cx: number, cy: number): ReactNode {
  return (
    <>
      <line x1={cx - 13} y1={cy} x2={cx + 9} y2={cy} stroke={STROKE} strokeWidth={SW} />
      <polygon points={`${cx + 14},${cy} ${cx + 6},${cy - 4} ${cx + 6},${cy + 4}`} fill={STROKE} />
    </>
  );
}

/**
 * The sensed voltage: two leads to open terminals, marked + and −.
 *
 * They are deliberately *not* joined. A voltage-controlled source senses
 * across a pair of nodes and draws no current, and drawing a line between
 * them would assert a conductive path that does not exist.
 */
export function voltageSense(left: number, right: number, bottom: number): ReactNode {
  const stop = bottom - 12;
  return (
    <>
      <line x1={left} y1={bottom} x2={left} y2={stop} stroke={STROKE} strokeWidth={SW} />
      <line x1={right} y1={bottom} x2={right} y2={stop} stroke={STROKE} strokeWidth={SW} />
      <circle cx={left} cy={stop - 3} r={3} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <circle cx={right} cy={stop - 3} r={3} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line
        x1={left - 4}
        y1={stop - 12}
        x2={left + 4}
        y2={stop - 12}
        stroke={STROKE}
        strokeWidth={SW}
      />
      <line x1={left} y1={stop - 16} x2={left} y2={stop - 8} stroke={STROKE} strokeWidth={SW} />
      <line
        x1={right - 4}
        y1={stop - 12}
        x2={right + 4}
        y2={stop - 12}
        stroke={STROKE}
        strokeWidth={SW}
      />
    </>
  );
}

/** The sensed current: one lead, with an arrow for the direction it is measured in. */
export function currentSense(x: number, bottom: number): ReactNode {
  const stop = bottom - 14;
  return (
    <>
      <line x1={x} y1={bottom} x2={x} y2={stop} stroke={STROKE} strokeWidth={SW} />
      <polygon
        points={`${x},${stop - 5} ${x - 4},${stop + 3} ${x + 4},${stop + 3}`}
        fill={STROKE}
      />
    </>
  );
}
