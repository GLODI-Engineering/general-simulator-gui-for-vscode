/**
 * FE-103: Catalog-driven primitive symbol renderer.
 *
 * Pure geometry renderer ported from the reference editor `schematic_editor.html`
 * (renderPrimitives + the SVG emitter). A primitive list renders identically to
 * a 2D canvas and to an SVG string. Symbol primitives are derived from block
 * metadata (`symbol.shape` / `symbol.path` / `symbol.text`) via
 * `metadataToPrimitives` — there is NO hardcoded per-component primitive table
 * in this module.
 */

import type { BlockMetadata, ParamValue } from "../../model/types";
import { resolveBlockBbox } from "./resolve-ports";

export type Primitive =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; lw?: number; color?: string }
  | {
      type: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      lw?: number;
      filled?: boolean;
      color?: string;
      /** Degrees, about the shape's own center. Optional, defaults to 0. */
      rotation?: number;
    }
  | {
      type: "rectf";
      x: number;
      y: number;
      w: number;
      h: number;
      color?: string;
      rotation?: number;
    }
  | {
      type: "circle";
      cx: number;
      cy: number;
      r: number;
      lw?: number;
      filled?: boolean;
      color?: string;
      /** A circle looks identical rotated; kept for schema symmetry only, not rendered as a visible effect. */
      rotation?: number;
    }
  | {
      type: "arc";
      cx: number;
      cy: number;
      r: number;
      a0: number;
      a1: number;
      ccw?: boolean;
      lw?: number;
      color?: string;
    }
  | { type: "polygon"; pts: Array<[number, number]>; lw?: number; filled?: boolean; color?: string }
  | { type: "polyline"; pts: Array<[number, number]>; lw?: number; color?: string }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      size?: number;
      align?: "start" | "center" | "end";
      baseline?: "top" | "middle" | "bottom";
      bold?: boolean;
      filled?: boolean;
      color?: string;
      /** Degrees, about the text's own anchor point (x, y). Optional, defaults to 0. */
      rotation?: number;
    };

/** Minimal structural subset of CanvasRenderingContext2D used by the renderer. */
export interface CanvasLike {
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  fillText(text: string, x: number, y: number): void;
}

export type RenderTarget =
  | { kind: "canvas"; ctx: CanvasLike; fg?: string }
  | { kind: "svg"; fg?: string };

const DEFAULT_FG = "#111827";

function textAnchor(align: Primitive extends { align: infer A } ? A : string | undefined): string {
  if (align === "start") return "start";
  if (align === "end") return "end";
  return "middle";
}

function dominantBaseline(baseline: string | undefined): string {
  if (baseline === "top") return "hanging";
  if (baseline === "bottom") return "ideographic";
  return "middle";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rotateAttr(cx: number, cy: number, rotation: number | undefined): string {
  if (!rotation) return "";
  return ` transform="rotate(${rotation} ${cx} ${cy})"`;
}

function primitiveToSvg(p: Primitive, fg: string): string {
  const color = p.color ?? fg;
  const lw = "lw" in p ? (p.lw ?? 1.5) : 1.5;
  switch (p.type) {
    case "line":
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${color}" stroke-width="${lw}" fill="none"/>`;
    case "rect":
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" stroke="${color}" stroke-width="${lw}" fill="${p.filled ? color : "none"}"${rotateAttr(p.x + p.w / 2, p.y + p.h / 2, p.rotation)}/>`;
    case "rectf":
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${color}"${rotateAttr(p.x + p.w / 2, p.y + p.h / 2, p.rotation)}/>`;
    case "circle":
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" stroke="${color}" stroke-width="${lw}" fill="${p.filled ? color : "none"}"/>`;
    case "arc": {
      const x0 = p.cx + p.r * Math.cos((p.a0 * Math.PI) / 180);
      const y0 = p.cy + p.r * Math.sin((p.a0 * Math.PI) / 180);
      const x1 = p.cx + p.r * Math.cos((p.a1 * Math.PI) / 180);
      const y1 = p.cy + p.r * Math.sin((p.a1 * Math.PI) / 180);
      const large = Math.abs(p.a1 - p.a0) > 180 ? 1 : 0;
      const sweep = p.ccw ? 0 : 1;
      return `<path d="M ${x0} ${y0} A ${p.r} ${p.r} 0 ${large} ${sweep} ${x1} ${y1}" stroke="${color}" stroke-width="${lw}" fill="none"/>`;
    }
    case "polygon":
      return `<polygon points="${p.pts.map(([x, y]) => `${x},${y}`).join(" ")}" stroke="${color}" stroke-width="${lw}" fill="${p.filled ? color : "none"}"/>`;
    case "polyline":
      return `<polyline points="${p.pts.map(([x, y]) => `${x},${y}`).join(" ")}" stroke="${color}" stroke-width="${lw}" fill="none"/>`;
    case "text":
      return `<text x="${p.x}" y="${p.y}" font-size="${p.size ?? 9}" font-weight="${p.bold ? "bold" : "normal"}" fill="${color}" text-anchor="${textAnchor(p.align)}" dominant-baseline="${dominantBaseline(p.baseline)}"${rotateAttr(p.x, p.y, p.rotation)}>${escapeXml(p.text)}</text>`;
  }
}

// NOTE: rect/rectf/text's `rotation` field (Symbol Editor resize/rotate
// handles) is only applied on the SVG path (primitiveToSvg, below) — the
// canvas path's CanvasLike interface has no save/translate/rotate/restore,
// and nothing in production actually renders through kind:"canvas" today
// (BlockSymbol.tsx always uses the SVG path). Extend CanvasLike if a real
// canvas consumer needs rotated primitives.
function drawPrimitive(p: Primitive, ctx: CanvasLike, fg: string): void {
  const color = p.color ?? fg;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = "lw" in p ? (p.lw ?? 1.5) : 1.5;
  switch (p.type) {
    case "line":
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      break;
    case "rect":
      if (p.filled) ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      break;
    case "rectf":
      ctx.fillRect(p.x, p.y, p.w, p.h);
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      if (p.filled) ctx.fill();
      else ctx.stroke();
      break;
    case "arc":
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, (p.a0 * Math.PI) / 180, (p.a1 * Math.PI) / 180, p.ccw ?? false);
      ctx.stroke();
      break;
    case "polygon":
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (p.filled) ctx.fill();
      else ctx.stroke();
      break;
    case "polyline":
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      break;
    case "text":
      ctx.font = `${p.bold ? "bold " : ""}${p.size ?? 9}px system-ui,sans-serif`;
      ctx.textAlign = p.align === "center" || p.align === undefined ? "center" : p.align;
      ctx.textBaseline = p.baseline ?? "middle";
      ctx.fillStyle = color;
      if (p.filled !== false) ctx.fillText(p.text, p.x, p.y);
      break;
  }
}

/**
 * Render a primitive list to a 2D canvas or to an SVG string. The same array
 * produces matching geometry in both targets.
 */
export function renderPrimitives(prims: Primitive[], target: RenderTarget): string {
  const fg = target.fg ?? DEFAULT_FG;
  if (target.kind === "svg") {
    return prims.map((p) => primitiveToSvg(p, fg)).join("");
  }
  const saved = { stroke: target.ctx.strokeStyle, fill: target.ctx.fillStyle };
  for (const p of prims) {
    drawPrimitive(p, target.ctx, fg);
    target.ctx.lineWidth = 1.5;
  }
  target.ctx.strokeStyle = saved.stroke;
  target.ctx.fillStyle = saved.fill;
  return "";
}

function interpolate(template: string, params: Record<string, ParamValue>): string {
  return template.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_, name: string) =>
    String(params[name] ?? `{${name}}`),
  );
}

/**
 * Derive the symbol body primitives for a block from its metadata. Reads only
 * `symbol.bbox`, `symbol.shape`, `symbol.path`, `symbol.primitives` (GSF,
 * BE-71) and `symbol.text` — never an inline component table. Custom (free
 * SVG `path`) shapes are not expressible as primitives and yield an empty
 * list; the caller renders the raw path instead.
 */
export interface PrimitiveOptions {
  /**
   * Replaces the body text that `symbol.text` would have produced. Used for the
   * instance-label promotion in `BlockSymbol`: when an author has named a block
   * ("VSI", "IM"), that name belongs in the box and the type's generic
   * abbreviation ("PY", "PMSM") is redundant next to it.
   */
  text?: string;
}

export function metadataToPrimitives(
  metadata: BlockMetadata,
  params: Record<string, ParamValue> = {},
  options: PrimitiveOptions = {},
): Primitive[] {
  const [w, h] = resolveBlockBbox(metadata, params);
  const out: Primitive[] = [];
  switch (metadata.symbol.shape) {
    case "circle":
      out.push({ type: "circle", cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 });
      break;
    case "triangle":
      out.push({
        type: "polygon",
        pts: [
          [0, h],
          [w, h / 2],
          [0, 0],
        ],
      });
      break;
    case "custom":
      break;
    case "primitives":
      // GsfPrimitive is structurally identical to Primitive (kept in sync
      // by hand — see the comment above GsfPrimitive in codegen.mjs).
      out.push(...((metadata.symbol.primitives ?? []) as unknown as Primitive[]));
      break;
    default:
      out.push({ type: "rect", x: 0, y: 0, w, h });
      break;
  }
  const bodyText =
    options.text ?? (metadata.symbol.text ? interpolate(metadata.symbol.text, params) : undefined);
  if (bodyText) {
    out.push({ type: "text", x: w / 2, y: h / 2, text: bodyText, size: 12 });
  }
  return out;
}
