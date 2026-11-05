/**
 * Artwork for the domain converters.
 *
 * These were the weakest family in the catalog. All eleven fell back to the
 * generic `shape: rect`, so an electrical-to-thermal converter and a
 * rotational-to-translational one drew as the *same blank box* — and the
 * `text:` their metadata carries (`e-th`, `t-r`) was never rendered, so not
 * even the abbreviation made it onto the sheet. The only thing telling them
 * apart was the instance name the user happened to type.
 *
 * A converter exists for exactly one reason: it crosses a domain boundary.
 * So the symbol shows the boundary. A divider splits the box, each side
 * carries its domain's tag in that domain's own colour — the same colour
 * the wires use, so the symbol agrees with what is attached to it — and an
 * arrow crosses the divider to give the direction.
 *
 * The colours are imported from the wire palette rather than copied. These
 * must not drift apart: a converter whose tag disagrees with the wire
 * running into it is worse than no tag at all.
 */
import type { ReactNode } from "react";

import type { PortKindDomain } from "../../../model/types";
import { wireColorForDomain } from "../../edges/wire-color";
import { type DrawContext, FILL, STROKE, SW, type SymbolDrawing } from "../symbol-drawing";

/**
 * One- or two-character tag per domain.
 *
 * Deliberately short: the box is 90 units wide and must hold two of these
 * plus a divider. `Θ` rather than `T` for thermal, so it cannot be mistaken
 * for translational.
 */
const TAG: Partial<Record<PortKindDomain, string>> = {
  signal: "S",
  "signal-bus": "S",
  "physical-signal": "PS",
  "physical-electrical": "E",
  "physical-rotational": "R",
  "physical-translational": "T",
  "physical-thermal": "Θ",
};

function tagFor(domain: PortKindDomain): string {
  return TAG[domain] ?? "?";
}

export function converterDrawing(
  from: PortKindDomain,
  to: PortKindDomain,
  width = 90,
): SymbolDrawing {
  const mid = width / 2;

  function draw(_ctx: DrawContext): ReactNode {
    const fromColor = wireColorForDomain(from);
    const toColor = wireColorForDomain(to);
    return (
      <g>
        <rect
          x={6}
          y={4}
          width={width - 12}
          height={32}
          rx={3}
          fill={FILL}
          stroke={STROKE}
          strokeWidth={SW}
        />
        {/* The boundary itself. Dashed: it is a change of representation,
            not a component the current flows through. */}
        <line
          x1={mid}
          y1={4}
          x2={mid}
          y2={36}
          stroke={STROKE}
          strokeWidth={SW}
          strokeDasharray="3 3"
        />
        <text
          x={mid - 11}
          y={24}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill={fromColor}
        >
          {tagFor(from)}
        </text>
        <text x={mid + 11} y={24} textAnchor="middle" fontSize={13} fontWeight={700} fill={toColor}>
          {tagFor(to)}
        </text>
        {/* Lead stubs in each side's own colour, so the change of domain is
            visible even before a wire is attached. */}
        <line x1={0} y1={20} x2={6} y2={20} stroke={fromColor} strokeWidth={SW} />
        <line x1={width - 6} y1={20} x2={width} y2={20} stroke={toColor} strokeWidth={SW} />
      </g>
    );
  }

  return { draw, inkHeight: 32 };
}
