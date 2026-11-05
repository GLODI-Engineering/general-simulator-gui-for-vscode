import { isAutoRefdes } from "../../library/refdes";
import type { BlockMetadata, Mirror, ParamValue, Rotation } from "../../model/types";
import { WIRE_STROKE } from "../edges/WireEdge";
import { Port } from "./Port";
import { shouldShowPortLabel } from "./port-labels";
import type { PortSide } from "./Port";
import { formatEngineering, getSchematicSymbol } from "./component-symbols";
import { SYMBOL_SCALE, getMetadataPortCenters } from "./port-hit-test";
import { type Primitive, metadataToPrimitives } from "./primitive-renderer";
import { resolveBlockBbox, resolveBlockPorts } from "./resolve-ports";

// Default stroke width for primitive shapes (in pre-scale coords). Derived from
// WIRE_STROKE (rather than a separately hand-picked constant, previously a
// hardcoded 2.1 that only approximated it — 2.1*1.6 ≈ 3.36px against
// WIRE_STROKE's actual ≈3.84px, a visible mismatch once anything with bold
// linework, like the MOSFET-style switch glyph, sits next to a wire) so a
// primitive-drawn shape's line weight exactly matches the wires connecting it.
const PRIM_SW = WIRE_STROKE / SYMBOL_SCALE;

/**
 * Transform that undoes the enclosing symbol group's rotation and mirror
 * about `(x, y)`, so text drawn inside it reads horizontally at any
 * orientation. Mirrors `UprightText` in component-symbols.tsx, which does the
 * same job for the hand-drawn symbols.
 */
function uprightTransform(x: number, y: number, rotation: Rotation, mirror: Mirror): string {
  if (rotation === 0 && mirror === "none") {
    return "";
  }
  const flip = mirror === "x" ? "scale(1 -1)" : mirror === "y" ? "scale(-1 1)" : "";
  return `translate(${x} ${y}) ${flip} rotate(${-rotation}) translate(${-x} ${-y})`
    .replace(/\s+/g, " ")
    .trim();
}

function PrimitiveShape({
  p,
  rotation = 0,
  mirror = "none",
}: { p: Primitive; rotation?: Rotation; mirror?: Mirror }) {
  const stroke = p.color ?? "#111827";
  switch (p.type) {
    case "rect":
      return (
        <rect
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          fill={p.filled ? stroke : "#ffffff"}
          stroke={stroke}
          strokeWidth={p.lw ?? PRIM_SW}
          transform={
            p.rotation ? `rotate(${p.rotation} ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined
          }
        />
      );
    case "circle":
      return (
        <circle
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={p.filled ? stroke : "#ffffff"}
          stroke={stroke}
          strokeWidth={p.lw ?? PRIM_SW}
        />
      );
    case "rectf":
      // Filled-only rectangle. Used (with an rgba colour) as the translucent
      // "cover" over a subcircuit's internal-content preview.
      return (
        <rect
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          fill={stroke}
          stroke="none"
          transform={
            p.rotation ? `rotate(${p.rotation} ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined
          }
        />
      );
    case "line":
      return (
        <line
          x1={p.x1}
          y1={p.y1}
          x2={p.x2}
          y2={p.y2}
          stroke={stroke}
          strokeWidth={p.lw ?? PRIM_SW}
        />
      );
    case "polygon":
      return (
        <polygon
          points={p.pts.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={p.filled ? stroke : "#ffffff"}
          stroke={stroke}
          strokeWidth={p.lw ?? PRIM_SW}
        />
      );
    case "polyline":
      return (
        <polyline
          points={p.pts.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={p.lw ?? PRIM_SW}
        />
      );
    case "text": {
      // Keep the caption upright. A generic catalog block draws its own name
      // inside its box; rotating the part rotated the name with it, so a
      // vertical switch or gate ended up captioned on its side. The symbol's
      // own `p.rotation` is deliberate artwork and is applied on top of the
      // counter-rotation, not instead of it.
      const upright = uprightTransform(p.x, p.y, rotation, mirror);
      const own = p.rotation ? `rotate(${p.rotation} ${p.x} ${p.y})` : "";
      const transform = [upright, own].filter(Boolean).join(" ") || undefined;
      return (
        <text
          x={p.x}
          y={p.y}
          textAnchor="middle"
          fontSize={p.size ?? 12}
          fill={stroke}
          transform={transform}
        >
          {p.text}
        </text>
      );
    }
    default:
      return null;
  }
}

function primitiveKey(p: Primitive): string {
  switch (p.type) {
    case "rect":
    case "rectf":
      return `${p.type}-${p.x}-${p.y}-${p.w}-${p.h}`;
    case "circle":
      return `circle-${p.cx}-${p.cy}-${p.r}`;
    case "line":
      return `line-${p.x1}-${p.y1}-${p.x2}-${p.y2}`;
    case "arc":
      return `arc-${p.cx}-${p.cy}-${p.r}-${p.a0}-${p.a1}`;
    case "polygon":
    case "polyline":
      return `${p.type}-${p.pts.map(([x, y]) => `${x}_${y}`).join("-")}`;
    case "text":
      return `text-${p.x}-${p.y}-${p.text}`;
  }
}

function symbolTransform(rotation: Rotation, mirror: Mirror, bbox: [number, number]) {
  const [w, h] = bbox;
  // Origin-aligned rotation/mirror that matches getPortCenter in port-hit-test
  // exactly. SVG applies a transform list right-to-left, so to compute
  // R(M(point)) the rotation must be written before the mirror.
  const parts: string[] = [];
  switch (rotation) {
    case 90:
      parts.push(`translate(${h} 0) rotate(90)`);
      break;
    case 180:
      parts.push(`translate(${w} ${h}) rotate(180)`);
      break;
    case 270:
      parts.push(`translate(0 ${w}) rotate(270)`);
      break;
    default:
      break;
  }
  if (mirror === "x") {
    parts.push(`translate(0 ${h}) scale(1 -1)`);
  } else if (mirror === "y") {
    parts.push(`translate(${w} 0) scale(-1 1)`);
  }
  return parts.join(" ");
}

function renderText(
  template: string | undefined,
  params: Record<string, ParamValue>,
): string | undefined {
  if (!template) {
    return undefined;
  }
  return template.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_, name: string) =>
    String(params[name] ?? `{${name}}`),
  );
}

/**
 * Gap, in screen px, between the symbol's bounding box and a label beside it.
 * A 14px label needs a few px so its descenders clear the box outline.
 */
const LABEL_GAP = 8;

/**
 * Extra clearance for a label forced onto a face that already carries ports.
 * `Port.tsx` draws a one-grid-unit (20) stub with a small terminal dot outside
 * the box, so this has to clear the tip rather than merely the outline.
 */
const PORT_CLEARANCE = 26;

/**
 * Where a label beside the part sits, as a fraction of the box height.
 * Below the centre line, clear of a gate or base lead leaving at mid-height.
 */
const BESIDE_LABEL_ROW = 0.74;

/** Vertical pitch between the static label and the value label when stacked. */
const LABEL_ROW = 15;

/**
 * Below the part first.
 *
 * A name above a symbol sits where the part's own leads and any wire coming
 * into the top of it already are, and on a three-terminal device whose only
 * free face is the right it ended up written across the body. Below is clear
 * on almost every part, because a two-terminal symbol's artwork is a thin
 * band on its port row and the space under it is empty.
 */
const LABEL_SIDE_PREFERENCE: readonly PortSide[] = ["bottom", "top", "right", "left"];

/**
 * Which face of the block the static label (and the value under it) sits on.
 *
 * The old rule picked from the aspect ratio — a block taller than it is wide
 * got its label to the *right*. That is precisely where a right-ported block
 * already draws its output stubs and their 10px labels, so every tall block
 * with outputs (`machine.pmsm`, the dq transforms, a multi-output script
 * block) stacked its name on top of its own port names.
 *
 * Ports are what the label has to avoid, so ports are what the rule reads.
 * `top` first because a name above the box is the schematic convention; a
 * two-terminal part drawn vertically has ports top *and* bottom and so falls
 * through to `right`, which is the convention for that case and is what it
 * already did.
 */
export function pickLabelSide(occupiedSides: ReadonlySet<PortSide>): PortSide {
  return LABEL_SIDE_PREFERENCE.find((side) => !occupiedSides.has(side)) ?? "top";
}

/**
 * Where the value label (`10 kΩ`, `100 µF`) goes, given where the name went.
 *
 * A name above the part puts its value below it and vice versa — the two read
 * as a pair bracketing the symbol, which is how every schematic draws a
 * two-terminal component laid out horizontally. A name beside the part (the
 * vertical case) keeps the value beside it too, on the next line down.
 */
export function pickValuePlacement(
  labelSide: PortSide,
  _occupiedSides: ReadonlySet<PortSide>,
  hasName: boolean,
): [PortSide, number] {
  // The value stacks directly under the name, on the same side. Splitting
  // them to opposite faces put a part's two pieces of text as far apart as
  // the symbol is tall, and the reader had to work out that they belonged
  // together. `R1` then `10 kΩ` on consecutive lines reads as one caption.
  return [labelSide, hasName ? 1 : 0];
}

interface LabelAnchor {
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
}

/**
 * How far a two-terminal symbol's artwork reaches either side of its port
 * row, in bbox units. A resistor's zigzag, a capacitor's plates, an
 * inductor's humps and a source's circle all stay within about this much.
 */
const TWO_TERMINAL_INK_REACH = 12;

/**
 * Height of the artwork a symbol actually draws, in scaled units — or the
 * full box height when that cannot be established.
 *
 * Anchoring labels to the bbox edge pushed them a long way from the thing
 * they label: an inductor's "100 µH" sat nearly half a part-height below a
 * coil only a few units tall, reading as detached rather than as that part's
 * value.
 *
 * The band is *derived*, not declared per symbol and not assumed globally.
 * A first attempt assumed every hand-drawn symbol fills a fixed centred
 * fraction of its box; that is true of the two-terminal family and false of
 * the switch, whose blade sits at offset 10 and whose control pair sits at
 * 30 — so its name landed on top of its own blade.
 *
 * The reliable signal is the ports. When every port is on the left or right
 * face at one shared offset, the artwork is a horizontal band centred on
 * that row, because that is the row the terminals have to meet. Anything
 * else — a switch's two rows, a transistor's three faces, a generic box —
 * keeps the bbox and the behaviour it had before.
 */
function symbolInkHeight(
  ports: ReadonlyArray<{ rotatedSide: string; offset?: number }>,
  bbox: [number, number],
  scaledHeight: number,
  rotated: boolean,
  handDrawn: boolean,
): number {
  // A generic catalog block draws a rectangle that really does fill its bbox,
  // so its label must clear the outline. Only the hand-drawn primitives leave
  // the box mostly empty.
  if (!handDrawn || ports.length === 0) {
    return scaledHeight;
  }
  const offsets = new Set<number>();
  for (const port of ports) {
    if (port.rotatedSide !== "left" && port.rotatedSide !== "right") {
      return scaledHeight;
    }
    if (port.offset === undefined) {
      return scaledHeight;
    }
    offsets.add(port.offset);
  }
  if (offsets.size !== 1) {
    return scaledHeight;
  }
  const span = Math.min(TWO_TERMINAL_INK_REACH * 2, rotated ? bbox[0] : bbox[1]);
  return span * SYMBOL_SCALE;
}

/**
 * Where to put the `row`-th label (0 = name, 1 = value) on `side` of a
 * `width`×`height` box. `crowded` means every face has ports, so the label has
 * to clear the stubs rather than merely the outline.
 *
 * `inkHeight`, when given, is the height of the artwork rather than of the
 * box, and top/bottom labels hug that instead of the outline.
 */
export function labelAnchorFor(
  side: PortSide,
  row: number,
  width: number,
  height: number,
  crowded: boolean,
  inkHeight: number = height,
): LabelAnchor {
  const gap = LABEL_GAP + (crowded ? PORT_CLEARANCE : 0);
  // Ink is centred on the box, so the slack is split evenly top and bottom.
  const inset = Math.max(0, (height - inkHeight) / 2);
  switch (side) {
    case "top":
      return { x: width / 2, y: inset - gap - row * LABEL_ROW, textAnchor: "middle" };
    case "bottom":
      return {
        x: width / 2,
        y: height - inset + gap + 8 + row * LABEL_ROW,
        textAnchor: "middle",
      };
    // Beside the part, below its centre line. A three-terminal device — a
    // MOSFET, a BJT — has pins on three faces, so its name can only go to the
    // side; power-electronics schematics put the designator there and low,
    // clear of the gate lead that leaves at mid-height.
    case "left":
      return { x: -gap, y: height * BESIDE_LABEL_ROW + row * LABEL_ROW, textAnchor: "end" };
    default:
      return { x: width + gap, y: height * BESIDE_LABEL_ROW + row * LABEL_ROW, textAnchor: "start" };
  }
}

/** Average glyph advance as a fraction of the font size, for the UI sans stack. */
const AVG_GLYPH_ADVANCE = 0.62;

/** Body text is drawn at this size, in pre-scale bbox units (see metadataToPrimitives). */
const BODY_TEXT_SIZE = 12;

/**
 * Usable text width inside a shape of the given bbox, in bbox units. A circle
 * is only as wide as its inscribed diameter; a triangle narrows toward its tip,
 * and its text sits at the half-width point.
 */
function innerTextWidth(shape: string | undefined, width: number, height: number): number {
  switch (shape) {
    case "circle":
      return Math.min(width, height) * 0.9;
    case "triangle":
      return width * 0.5;
    default:
      return width - 6;
  }
}

/**
 * Whether `label` says nothing `typeText` (the type's own default caption)
 * does not already say, once both are trimmed and case-folded.
 *
 * Split out from {@link authoredLabel} because the two callers need different
 * things done with a redundant label: `authoredLabel` drops it outright
 * (nothing new to promote into the box), while the top-label fallback in
 * `BlockSymbol` must still show a *reference designator* above the box even
 * when it, too, is "redundant" in the different sense `authoredLabel` also
 * rejects (`isAutoRefdes`) — only a label that duplicates the caption text
 * itself should disappear entirely.
 */
function duplicatesTypeText(label: string | undefined, typeText: string | undefined): boolean {
  const trimmed = label?.trim();
  return !!trimmed && !!typeText && trimmed.toLowerCase() === typeText.trim().toLowerCase();
}

/**
 * The block's own name, when the author actually gave it one.
 *
 * Rejects the auto-assigned reference designator (`Sum1`, `Pid3`) and a label
 * that merely repeats the type's own abbreviation — neither says anything the
 * symbol does not already say.
 */
function authoredLabel(
  label: string | undefined,
  type: string,
  typeText: string | undefined,
): string | undefined {
  const trimmed = label?.trim();
  if (!trimmed || isAutoRefdes(trimmed, type)) {
    return undefined;
  }
  if (duplicatesTypeText(trimmed, typeText)) {
    return undefined;
  }
  return trimmed;
}

interface BlockSymbolProps {
  metadata: BlockMetadata;
  rotation: Rotation;
  mirror: Mirror;
  params: Record<string, ParamValue>;
  blockPosition?: [number, number];
  showLabels?: boolean;
  /** Instance label / reference designator (R1, C3 …) shown above the symbol. */
  label?: string;
}

export function BlockSymbol({
  metadata,
  rotation,
  mirror,
  params,
  blockPosition = [0, 0],
  showLabels = true,
  label,
}: BlockSymbolProps) {
  const resolvedBbox = resolveBlockBbox(metadata, params);
  const [width, height] = resolvedBbox;
  const fakeBlock = {
    id: metadata.name,
    type: metadata.name,
    paradigm: "signal-flow" as const,
    domain: "signal" as const,
    fidelity: "n_a" as const,
    position: blockPosition,
    rotation,
    mirror,
    params,
    ic: {},
  };
  const ports = getMetadataPortCenters(fakeBlock, metadata);
  // Same expansion getMetadataPortCenters applied, for the per-port kind/label/direction
  // lookup below — a variadic port is not in metadata.ports.inputs.
  const resolvedPorts = resolveBlockPorts(metadata, params);

  const metadataType = "type" in metadata ? String(metadata.type) : undefined;
  const metadataAliases = Array.isArray(metadata.aliases) ? metadata.aliases : [];
  const schematic = getSchematicSymbol(metadata.name, metadataType, ...metadataAliases);
  // No padding: the SVG origin aligns exactly with the block's model position.
  // This keeps ReactFlow Handle coordinates identical to model port centres so
  // wire start/end points match the routing waypoints and wires stay orthogonal.
  // Port stubs and labels extend beyond the SVG bounds; overflow:visible renders
  // them correctly.
  const rotated = rotation === 90 || rotation === 270;
  const scaledWidth = (rotated ? height : width) * SYMBOL_SCALE;
  const scaledHeight = (rotated ? width : height) * SYMBOL_SCALE;
  const svgWidth = scaledWidth;
  const svgHeight = scaledHeight;

  let valueLabel: string | undefined;
  if (schematic?.valueParam) {
    const raw = params[schematic.valueParam];
    if (typeof raw === "number") {
      valueLabel = formatEngineering(raw, schematic.unit ?? "");
    } else if (typeof raw === "string" && raw.length > 0) {
      valueLabel = schematic.unit ? `${raw} ${schematic.unit}` : raw;
    }
  }
  // A `{param}` placeholder makes the body text carry real instance data (a
  // gain's k, a gate's operator), so it is never displaced. A literal one is
  // the type's abbreviation — 478 of the catalog's 485 texted blocks — and an
  // authored name is strictly more informative than that.
  const typeTextIsStatic =
    metadata.symbol.text !== undefined && !/\{[a-z][a-z0-9_]*\}/i.test(metadata.symbol.text);
  const typeText = renderText(metadata.symbol.text, params);
  const instanceLabel = authoredLabel(label, metadata.name, typeText);
  // Promote the authored name into the box only when it genuinely fits: a name
  // wider than the box would spill over the outline and the ports, which is
  // worse than the stacked pair it replaces. It then keeps its place above.
  const bodyLabel =
    schematic === undefined &&
    metadata.symbol.shape !== "custom" &&
    typeTextIsStatic &&
    instanceLabel !== undefined &&
    instanceLabel.length * AVG_GLYPH_ADVANCE * BODY_TEXT_SIZE <=
      innerTextWidth(metadata.symbol.shape, width, height)
      ? instanceLabel
      : undefined;

  // With the name inside the box, repeating it above is the redundancy this
  // whole branch exists to remove — but only when the label actually duplicates
  // the type's own caption. A reference designator ("R1", "Pmsm1") is also
  // dropped from `instanceLabel`, for a different reason (it is auto-assigned,
  // not descriptive), yet must still surface here: that is the only place it is
  // ever drawn. Using `instanceLabel` for this fallback conflated the two cases
  // and made every auto-refdes part draw with no label above it at all;
  // `labelForTop` narrows the drop to just the genuine duplicate — an authored
  // label that happens to equal the type's default text (e.g. naming a
  // `control.transform.clarke_park_inv` block "dq0/abc", which is that type's
  // own default caption) is already shown once, unconditionally, via
  // `inlineFallbackLabel` below, so showing it again above would be the exact
  // overlapping duplicate this mechanism exists to prevent.
  // Dropping a duplicate top label is only safe when that same text is already drawn
  // somewhere else on the symbol. For a generic shape (`schematic === undefined`) that is
  // always true regardless of whether `bodyLabel` itself fits: either the name is inside
  // the box (`bodyLabel`), or -- when it does not fit, or the shape is "custom" -- the top
  // falls through to `metadata.label`, the catalogue's own display name, which is never the
  // bare duplicate (that is the mechanism row 1/row 3's fixes already established and
  // tested; do not re-decide it here). A SCHEMATIC_SYMBOLS entry is different: it never has
  // a `bodyLabel` (the branch above requires `schematic === undefined`), so the *only* place
  // its name can ever be shown is this top label, unless the entry declares its own
  // `staticLabel` (the diode's "D", shown via `semi.diode`'s `staticLabel`). Most entries --
  // the passives (`passive.resistor`/`.capacitor`/`.inductor`) and the switch family --
  // declare no `staticLabel`, because their hand-drawn glyph never renders any inline text
  // of its own. For those, an authored label equal to the type's own caption (the natural
  // thing to type -- "R" on a resistor, "L" on an inductor, "SW" on a switch, exactly what a
  // hand-drawn schematic's own reference designator looks like) was suppressed here on the
  // wrong assumption that the body already showed it. It never did: the block lost its name
  // entirely, invisible both inside and above. A switch loses all labelling this way (no
  // `valueParam` either); a resistor/inductor/capacitor still shows its value but silently
  // loses its own letter.
  const suppressDuplicateTopLabel =
    schematic === undefined || schematic.staticLabel !== undefined;
  const labelForTop =
    duplicatesTypeText(label, typeText) && suppressDuplicateTopLabel ? undefined : label;
  const topLabel = bodyLabel
    ? undefined
    : (labelForTop ?? schematic?.staticLabel ?? (schematic ? undefined : metadata.label));
  const inlineFallbackLabel = schematic === undefined ? (typeText ?? metadata.label) : undefined;

  // A drawing that declares its own band is believed; the derivation below is
  // only a fallback for the older artwork that cannot say.
  const declaredInk =
    schematic?.inkHeight !== undefined
      ? schematic.inkHeight * SYMBOL_SCALE
      : undefined;
  const derivedInk = symbolInkHeight(
    ports.map((port) => ({
      rotatedSide: port.rotatedSide as string,
      offset: resolvedPorts.inputs
        .concat(resolvedPorts.outputs)
        .find((candidate) => candidate.id === port.id)?.offset,
    })),
    resolvedBbox,
    scaledHeight,
    rotated,
    schematic !== undefined && schematic.inkHeight === undefined,
  );
  const inkHeight = declaredInk ?? derivedInk;

  const signalPortCount = [...resolvedPorts.inputs, ...resolvedPorts.outputs].filter(
    (port) => shouldShowPortLabel(port.kind, 2),
  ).length;

  const occupiedSides = new Set<PortSide>(ports.map((port) => port.rotatedSide as PortSide));
  const labelSide = pickLabelSide(occupiedSides);
  const crowded = occupiedSides.has(labelSide);
  const [valueSide, valueRow] = pickValuePlacement(
    labelSide,
    occupiedSides,
    topLabel !== undefined,
  );

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <title> rendered only when showLabels=true; sidebar preview sets aria-hidden via parent and omits the title to avoid duplicate text in screen readers.
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="block-symbol"
      aria-hidden={!showLabels || undefined}
      style={{ overflow: "visible" }}
    >
      {showLabels ? <title>{metadata.label}</title> : null}
      <g transform={`scale(${SYMBOL_SCALE}) ${symbolTransform(rotation, mirror, resolvedBbox)}`}>
        {/* A `shape: "custom"` path is artwork the document itself carries, so
            it outranks a catalog drawing: the more specific description of
            this particular block wins over the generic one for its type. */}
        {metadata.symbol.shape === "custom" && metadata.symbol.path ? (
          <path d={metadata.symbol.path} fill="#ffffff" stroke="#111827" strokeWidth={1.5} />
        ) : schematic ? (
          schematic.render({ width, height, params, rotation, mirror })
        ) : (
          <>
            {metadata.symbol.shape === "custom" && metadata.symbol.path ? (
              <path d={metadata.symbol.path} fill="#ffffff" stroke="#111827" strokeWidth={1.5} />
            ) : (
              metadataToPrimitives(metadata, params, { text: bodyLabel }).map((p) => (
                <PrimitiveShape
                  key={primitiveKey(p)}
                  p={p}
                  rotation={rotation}
                  mirror={mirror}
                />
              ))
            )}
            {showLabels && inlineFallbackLabel && metadata.symbol.shape === "custom" ? (
              <text
                x={width / 2}
                y={height / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fill="#111827"
              >
                {inlineFallbackLabel}
              </text>
            ) : null}
          </>
        )}
      </g>
      {showLabels && topLabel ? (
        <text
          {...labelAnchorFor(labelSide, 0, scaledWidth, scaledHeight, crowded, inkHeight)}
          fontSize={14}
          fontWeight={700}
          fill="#0f172a"
        >
          {topLabel}
        </text>
      ) : null}
      {showLabels && valueLabel ? (
        <text
          {...labelAnchorFor(valueSide, valueRow, scaledWidth, scaledHeight, crowded, inkHeight)}
          fontSize={13}
          fontWeight={500}
          fill="#1f2937"
        >
          {valueLabel}
        </text>
      ) : null}
      {ports.map((port) => {
        const inputPort = resolvedPorts.inputs.find((candidate) => candidate.id === port.id);
        const outputPort = resolvedPorts.outputs.find((candidate) => candidate.id === port.id);
        const portDef = inputPort ?? outputPort;
        if (!portDef) {
          return null;
        }
        const direction = inputPort ? "in" : outputPort ? "out" : "inout";
        return (
          <Port
            key={port.id}
            id={port.id}
            x={port.center.x - blockPosition[0]}
            y={port.center.y - blockPosition[1]}
            kind={portDef.kind}
            direction={direction}
            label={shouldShowPortLabel(portDef.kind, signalPortCount) ? portDef.label : undefined}
            side={port.rotatedSide}
            decorate={!schematic?.selfDrawnPorts}
          />
        );
      })}
    </svg>
  );
}

export default BlockSymbol;
