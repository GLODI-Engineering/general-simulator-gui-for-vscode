import type { ReactNode, SVGProps } from "react";

import type { ParamValue } from "../../model/types";
import { WIRE_STROKE } from "../edges/WireEdge";
import { SYMBOL_SCALE } from "./port-hit-test";

/**
 * The contract an artwork file satisfies.
 *
 * **A drawing is not the component.** What a component *is* — its ports,
 * their sides and offsets, its bounding box, its parameters, what it
 * compiles to — lives in `packages/blocks/**\/metadata.yaml` and in
 * gsim-core's compile registry. None of that is here, and changing a
 * drawing must never change any of it.
 *
 * What is here is only how it looks. That separation is the point: new
 * artwork should be a file you drop in, not a library you rewrite. One file
 * per symbol under `symbols/`, one line in `symbols/registry.ts` naming the
 * catalog types it draws, and nothing else moves.
 *
 * A drawing is handed a box and must stay inside it, touch every terminal
 * the metadata declares, and use the supplied stroke width. It is not told
 * where the ports are, because it is not allowed to move them — it is told
 * the box they sit on.
 */

/** Near-black for every stroke. Two colours exist; this is one of them. */
export const STROKE = "#0f172a";
/** White, for a shape that must occlude what is behind it. */
export const FILL = "#ffffff";

/**
 * Stroke width for artwork, in local units.
 *
 * Derived from the wire stroke rather than picked, so a component's outline
 * and the wire entering it are the same weight. A seam at the port reads as
 * a defect even when nobody can say why.
 */
export const SW = WIRE_STROKE / SYMBOL_SCALE;

export type Rotation = 0 | 90 | 180 | 270;
export type Mirror = "none" | "x" | "y";

/** What a drawing is given. */
export interface DrawContext {
  /** Box width in local units; artwork must stay within it. */
  width: number;
  /** Box height in local units. */
  height: number;
  /** The instance's parameters, for a drawing that shows a value. */
  params: Record<string, ParamValue>;
  /** Orientation of the enclosing group — only `SymbolLabel` needs this. */
  rotation?: Rotation;
  mirror?: Mirror;
}

/** One component's artwork. */
export interface SymbolDrawing {
  /** The picture. */
  draw: (ctx: DrawContext) => ReactNode;
  /**
   * Parameter whose value is printed beside the symbol (`R`, `C`, `L`, `V`).
   * The renderer formats and places it; the drawing does not draw it.
   */
  valueParam?: string;
  /** Unit for that value (`Ω`, `F`, `H`). */
  unit?: string;
  /** Caption above the symbol when the instance has no label of its own. */
  staticLabel?: string;
  /**
   * Set when the artwork draws its own terminal stubs and dots, so the
   * generic port overlay does not double them.
   */
  selfDrawnPorts?: boolean;
  /**
   * How tall the artwork actually is, in local units, when it does not fill
   * its box. The name and value are placed just clear of *this*, not of the
   * box outline.
   *
   * A two-terminal part draws a thin band on its port row and leaves most of
   * the box empty, so anchoring its value to the box edge pushed it far below
   * the thing it labels. A control block drawn as a rectangle really does
   * fill its box and must leave this unset, or its name lands on its own
   * outline. The drawing knows which it is; the renderer cannot reliably
   * guess, and guessing is what put a switch's name across its own blade.
   */
  inkHeight?: number;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Font sizes in local units. */
const LABEL_SIZE = { sm: 10, md: 13, lg: 16 } as const;
export type LabelSize = keyof typeof LABEL_SIZE;

/**
 * Average glyph advance as a fraction of font size, for the UI sans stack.
 * Used to fit text without measuring in the DOM — a symbol renders inside an
 * SVG that may not be laid out yet, and `getComputedTextLength` would force
 * a reflow per glyph.
 */
const GLYPH_ADVANCE = 0.58;

/** Never shrink text below this; past it, it is unreadable anyway. */
const MIN_FONT = 8;

/**
 * Transform undoing the enclosing group's rotation and mirror about
 * `(x, y)`, so what it wraps reads the right way up at any orientation.
 */
export function uprightAbout(
  x: number,
  y: number,
  rotation: Rotation = 0,
  mirror: Mirror = "none",
): string | undefined {
  if (rotation === 0 && mirror === "none") {
    return undefined;
  }
  const flip = mirror === "x" ? "scale(1 -1)" : mirror === "y" ? "scale(-1 1)" : "";
  return `translate(${x} ${y}) ${flip} rotate(${-rotation}) translate(${-x} ${-y})`
    .replace(/\s+/g, " ")
    .trim();
}

export interface SymbolLabelProps extends Omit<SVGProps<SVGTextElement>, "x" | "y" | "children"> {
  ctx: DrawContext;
  /** Visual centre, horizontally and vertically. */
  x: number;
  y: number;
  size?: LabelSize;
  /**
   * Widest the text may be, in local units. Past it the font shrinks to fit
   * rather than overflowing the box — a name running past its own outline
   * and over the wires is worse than a smaller name.
   */
  maxWidth?: number;
  children: string;
}

/**
 * Text inside a symbol: centred, upright at any rotation, shrunk to fit.
 *
 * `dominant-baseline` is not used — it is inconsistent across engines. The
 * baseline is placed at `y + 0.36 * fontSize`, the cap-height midline, which
 * centres the glyphs optically.
 */
export function SymbolLabel({
  ctx,
  x,
  y,
  size = "md",
  maxWidth,
  children,
  ...rest
}: SymbolLabelProps): ReactNode {
  let fontSize: number = LABEL_SIZE[size];
  if (maxWidth !== undefined && children.length > 0) {
    const estimated = GLYPH_ADVANCE * fontSize * children.length;
    if (estimated > maxWidth) {
      fontSize = Math.max(MIN_FONT, (fontSize * maxWidth) / estimated);
    }
  }
  const transform = uprightAbout(x, y, ctx.rotation ?? 0, ctx.mirror ?? "none");
  const text = (
    <text
      x={x}
      y={y + 0.36 * fontSize}
      textAnchor="middle"
      fontSize={fontSize}
      fontWeight={600}
      fill={STROKE}
      pointerEvents="none"
      {...rest}
    >
      {children}
    </text>
  );
  return transform ? <g transform={transform}>{text}</g> : text;
}
