/**
 * Reference-designator naming for freshly inserted blocks.
 *
 * Split out of `insert.ts` because the renderer needs the *inverse* question —
 * "is this label one we generated, or one the author actually chose?" — and
 * `insert.ts` reaches into the Zustand stores, which a pure symbol renderer
 * must not depend on.
 */

import type { Block } from "../model/types";

/** SPICE-style reference-designator prefix for a block type. */
export function refdesPrefix(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("resistor")) return "R";
  if (t.includes("capacitor")) return "C";
  if (t.includes("inductor")) return "L";
  if (t.includes("diode")) return "D";
  if (t.includes("bjt")) return "Q";
  if (t.includes("mosfet") || t.includes("vdmos")) return "M";
  if (t.includes("jfet")) return "J";
  if (t.includes("mesfet")) return "Z";
  if (t.includes("vcvs")) return "E";
  if (t.includes("vccs")) return "G";
  if (t.includes("cccs")) return "F";
  if (t.includes("ccvs")) return "H";
  if (t.includes("source.voltage")) return "V";
  if (t.includes("source.current")) return "I";
  if (t.includes("switch")) return "S";
  if (t.includes("tline")) return "T";
  if (t.includes("subsystem") || t.includes("hierarchy")) return "X";
  // Signal-flow / control blocks: a readable name from the last path segment.
  const segment = t.split(".").pop() ?? "blk";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function refdesPattern(type: string): RegExp {
  const prefix = refdesPrefix(type);
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
}

/** Next unused reference designator (R1, C3, Q26 …) for a type. */
export function assignRefdes(type: string, blocks: Block[]): string {
  const pattern = refdesPattern(type);
  let max = 0;
  for (const block of blocks) {
    const match = block.label?.match(pattern);
    if (match?.[1]) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `${refdesPrefix(type)}${max + 1}`;
}

/**
 * True when `label` is exactly what `assignRefdes` would have produced for this
 * type — `Sum1`, `Pid3`, `R12`. Such a label carries no meaning beyond "the
 * second one of these", so the renderer keeps it out of the block's body and
 * leaves the type's own symbol text in place.
 */
export function isAutoRefdes(label: string, type: string): boolean {
  return refdesPattern(type).test(label);
}
