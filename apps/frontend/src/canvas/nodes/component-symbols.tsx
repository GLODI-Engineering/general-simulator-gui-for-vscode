import type { ReactNode, SVGProps } from "react";
import type { ParamValue } from "../../model/types";
import { WIRE_STROKE } from "../edges/WireEdge";
import { SYMBOL_SCALE } from "./port-hit-test";
import PmosSvg from "./symbols/spice-primitive-P-MOS.drawio.svg?react";

const STROKE = "#0f172a";
const FILL = "#ffffff";
// Every schematic symbol here is drawn pre-scale, inside BlockSymbol's own
// scale(SYMBOL_SCALE) transform, so a stroke drawn at this width renders at
// SW * SYMBOL_SCALE on screen. Deriving it from WIRE_STROKE (rather than a
// separately hand-picked constant, previously 2.1 — an approximation that
// rendered ~3.36px against WIRE_STROKE's actual ~3.84px) keeps every
// component's own line weight exactly matched to the wires connecting it,
// not just visually close.
const SW = WIRE_STROKE / SYMBOL_SCALE;

export interface SymbolContext {
  width: number;
  height: number;
  params: Record<string, ParamValue>;
  /** Orientation of the enclosing symbol group — see `UprightText`. */
  rotation?: 0 | 90 | 180 | 270;
  mirror?: "none" | "x" | "y";
}

/**
 * Text inside a symbol, kept the right way up.
 *
 * `BlockSymbol` draws every symbol inside one `rotate()`/`scale()` group, so
 * rotating a part rotates its artwork — which is the point for a resistor's
 * zigzag, and wrong for the lettering on it. A DC source turned upright
 * rendered its minus sign as a vertical bar and its "+" on its side; a
 * rotated gate's operator fell over with it. Glyphs do not rotate on a real
 * schematic, at any orientation.
 *
 * This undoes the group's linear transform about the text's own anchor, so
 * the text stays where the symbol put it and reads horizontally. The group
 * applies R(theta) then the mirror, so the inverse is the mirror followed by
 * R(-theta) — and an SVG transform list applies right to left, which is why
 * they are written in that order.
 */
/**
 * Transform that undoes the symbol group's rotation and mirror about
 * `(x, y)`, so whatever it wraps reads the right way up at any orientation.
 */
export function uprightAbout(x: number, y: number, ctx: SymbolContext): string | undefined {
  const rotation = ctx.rotation ?? 0;
  const mirror = ctx.mirror ?? "none";
  if (rotation === 0 && mirror === "none") {
    return undefined;
  }
  const flip = mirror === "x" ? "scale(1 -1)" : mirror === "y" ? "scale(-1 1)" : "";
  return `translate(${x} ${y}) ${flip} rotate(${-rotation}) translate(${-x} ${-y})`
    .replace(/\s+/g, " ")
    .trim();
}

export function UprightText({
  ctx,
  x,
  y,
  children,
  ...rest
}: {
  ctx: SymbolContext;
  x: number;
  y: number;
  children: ReactNode;
} & Omit<SVGProps<SVGTextElement>, "x" | "y" | "children">) {
  const rotation = ctx.rotation ?? 0;
  const mirror = ctx.mirror ?? "none";
  if (rotation === 0 && mirror === "none") {
    return (
      <text x={x} y={y} {...rest}>
        {children}
      </text>
    );
  }
  const counter = uprightAbout(x, y, ctx);
  return (
    <g transform={counter}>
      <text x={x} y={y} {...rest}>
        {children}
      </text>
    </g>
  );
}

export interface SchematicSymbol {
  render: (ctx: SymbolContext) => ReactNode;
  valueParam?: string;
  unit?: string;
  /** Override the static text label drawn below the symbol (e.g. for sources). */
  staticLabel?: string;
  /**
   * Set when the symbol's own artwork already draws terminal stubs, dots and
   * letter labels (imported draw.io symbols). Suppresses the generic Port
   * overlay's visuals so they don't double up — see Port.tsx `decorate`.
   */
  selfDrawnPorts?: boolean;
}

const SI_PREFIXES: Array<[number, string]> = [
  [1e12, "T"],
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
  [1e-15, "f"],
];

export function formatEngineering(value: number, unit = ""): string {
  if (!Number.isFinite(value)) return `${value}${unit}`;
  if (value === 0) return `0 ${unit}`.trimEnd();
  const abs = Math.abs(value);
  for (const [scale, prefix] of SI_PREFIXES) {
    if (abs >= scale) {
      const scaled = value / scale;
      const text =
        Math.abs(scaled) >= 100
          ? scaled.toFixed(0)
          : Math.abs(scaled) >= 10
            ? scaled.toFixed(1)
            : scaled.toFixed(2);
      const trimmed = text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
      return `${trimmed} ${prefix}${unit}`.trimEnd();
    }
  }
  const tail = SI_PREFIXES[SI_PREFIXES.length - 1];
  if (!tail) return `${value}${unit}`;
  return `${(value / tail[0]).toExponential(2)} ${tail[1]}${unit}`.trimEnd();
}

// ── Resistor (IEEE zigzag) ───────────────────────────────────────────────────
function resistorPath(y: number): string {
  return `M 0 ${y} L 12 ${y} L 15 ${y - 6} L 21 ${y + 6} L 27 ${y - 6} L 33 ${y + 6} L 39 ${y - 6} L 45 ${y + 6} L 48 ${y} L 60 ${y}`;
}

// ── Capacitor (parallel plates) ──────────────────────────────────────────────
function capacitorPaths(y: number, half: number): string[] {
  return [
    `M 0 ${y} L 26 ${y}`,
    `M 26 ${y - half} L 26 ${y + half}`,
    `M 34 ${y - half} L 34 ${y + half}`,
    `M 34 ${y} L 60 ${y}`,
  ];
}

// ── Inductor (four humps) ────────────────────────────────────────────────────
function inductorPath(y: number): string {
  // Four arcs from x=12 to x=48 (each arc 9 wide).
  return [
    `M 0 ${y} L 12 ${y}`,
    `A 4.5 4.5 0 0 1 21 ${y}`,
    `A 4.5 4.5 0 0 1 30 ${y}`,
    `A 4.5 4.5 0 0 1 39 ${y}`,
    `A 4.5 4.5 0 0 1 48 ${y}`,
    `L 60 ${y}`,
  ].join(" ");
}

// ── Coupled inductors / transformer (two vertical windings + core) ──────────
// passive.inductor.coupled's own ports: p1/n1 (primary, left, y=10/30),
// p2/n2 (secondary, right, y=10/30) — the standard transformer symbol: each
// winding drawn as a small vertical coil, a laminated-core bar between them,
// and a polarity dot at each winding's "start" (p1/p2) end.
function verticalInductorPath(x: number, y0: number, y1: number, bulgeRight: boolean): string {
  const r = (y1 - y0) / 6;
  const sweep = bulgeRight ? 1 : 0;
  return [
    `M ${x} ${y0}`,
    `A ${r} ${r} 0 0 ${sweep} ${x} ${y0 + 2 * r}`,
    `A ${r} ${r} 0 0 ${sweep} ${x} ${y0 + 4 * r}`,
    `A ${r} ${r} 0 0 ${sweep} ${x} ${y1}`,
  ].join(" ");
}

function coupledInductorRender(ctx: SymbolContext): ReactNode {
  const { width: w, height: h } = ctx;
  const y0 = h * 0.17;
  const y1 = h * 0.5;
  const leftX = w * 0.33;
  const rightX = w * 0.67;
  const coreX1 = w * 0.47;
  const coreX2 = w * 0.53;
  return (
    <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round">
      {/* Primary winding: p1 -> coil -> n1 */}
      <line x1={0} y1={y0} x2={leftX} y2={y0} />
      <path d={verticalInductorPath(leftX, y0, y1, true)} />
      <line x1={0} y1={y1} x2={leftX} y2={y1} />
      {/* Secondary winding: p2 -> coil -> n2 */}
      <line x1={w} y1={y0} x2={rightX} y2={y0} />
      <path d={verticalInductorPath(rightX, y0, y1, false)} />
      <line x1={w} y1={y1} x2={rightX} y2={y1} />
      {/* Laminated core */}
      <line x1={coreX1} y1={y0} x2={coreX1} y2={y1} strokeWidth={SW * 0.8} />
      <line x1={coreX2} y1={y0} x2={coreX2} y2={y1} strokeWidth={SW * 0.8} />
      {/* Polarity dots (p1/p2 -- matching-polarity convention) */}
      <circle cx={leftX - 4} cy={y0 + 2} r={1.6} fill={STROKE} stroke="none" />
      <circle cx={rightX + 4} cy={y0 + 2} r={1.6} fill={STROKE} stroke="none" />
    </g>
  );
}

// ── Source body (circle with leads) ──────────────────────────────────────────
function sourceCircle(ctx: SymbolContext, glyph: ReactNode): ReactNode {
  const y = ctx.height / 2;
  return (
    <g>
      <line x1={0} y1={y} x2={20} y2={y} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={y} x2={60} y2={y} stroke={STROKE} strokeWidth={SW} />
      <circle cx={30} cy={y} r={10} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      {/* The glyph is a pictogram — a pulse train, a sine, a current arrow —
          and like lettering it does not turn with the part. A source drawn
          vertically, which is the common case, otherwise showed its waveform
          lying on its side. The leads and circle above are rotationally
          symmetric, so only this needs undoing. */}
      <g transform={uprightAbout(30, y, ctx)}>{glyph}</g>
    </g>
  );
}

// Voltage glyphs
function dcVoltageGlyph(y: number, _ctx: SymbolContext): ReactNode {
  // Plain text: `sourceCircle` already wraps every glyph in the counter-
  // rotation, so undoing the rotation here as well turned it the wrong way
  // by twice the angle and put the minus sign back on its side.
  return (
    <g>
      <text x={26} y={y - 1} fontSize={8} fill={STROKE} textAnchor="middle">
        +
      </text>
      <text x={34} y={y + 3} fontSize={10} fill={STROKE} textAnchor="middle">
        −
      </text>
    </g>
  );
}

function sineGlyph(y: number): ReactNode {
  return (
    <path
      d={`M 24 ${y} Q 27 ${y - 4} 30 ${y} T 36 ${y}`}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW}
      strokeLinecap="round"
    />
  );
}

function pulseGlyph(y: number): ReactNode {
  return (
    <path
      d={`M 24 ${y + 3} L 26 ${y + 3} L 26 ${y - 3} L 30 ${y - 3} L 30 ${y + 3} L 34 ${y + 3} L 34 ${y - 3} L 36 ${y - 3}`}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW}
      strokeLinejoin="miter"
    />
  );
}

function expGlyph(y: number): ReactNode {
  return (
    <path
      d={`M 24 ${y + 4} C 28 ${y + 4} 32 ${y - 4} 36 ${y - 4}`}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW}
      strokeLinecap="round"
    />
  );
}

function pwlGlyph(y: number): ReactNode {
  return (
    <path
      d={`M 24 ${y + 3} L 27 ${y - 3} L 30 ${y + 1} L 33 ${y - 2} L 36 ${y + 3}`}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

function noiseGlyph(y: number): ReactNode {
  return (
    <path
      d={`M 24 ${y} L 25 ${y + 3} L 26 ${y - 2} L 27 ${y + 2} L 28 ${y - 3} L 29 ${y + 1} L 30 ${y - 2} L 31 ${y + 3} L 32 ${y - 1} L 33 ${y + 2} L 34 ${y - 3} L 35 ${y + 1} L 36 ${y}`}
      fill="none"
      stroke={STROKE}
      strokeWidth={SW * 0.9}
      strokeLinecap="round"
    />
  );
}

function currentArrowGlyph(y: number): ReactNode {
  return (
    <g>
      <line x1={24} y1={y} x2={36} y2={y} stroke={STROKE} strokeWidth={SW} />
      <path
        d={`M 36 ${y} L 32 ${y - 3} L 32 ${y + 3} Z`}
        fill={STROKE}
        stroke={STROKE}
        strokeWidth={SW * 0.5}
      />
    </g>
  );
}

// ── Diode ────────────────────────────────────────────────────────────────────
function diodeRender(ctx: SymbolContext, kind: "standard" | "zener" = "standard"): ReactNode {
  const y = ctx.height / 2;
  return (
    <g>
      <line x1={0} y1={y} x2={22} y2={y} stroke={STROKE} strokeWidth={SW} />
      <path
        d={`M 22 ${y - 8} L 22 ${y + 8} L 38 ${y} Z`}
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      {kind === "standard" ? (
        <line x1={38} y1={y - 8} x2={38} y2={y + 8} stroke={STROKE} strokeWidth={SW} />
      ) : (
        <path
          d={`M 34 ${y - 8} L 38 ${y - 8} L 38 ${y + 8} L 42 ${y + 8}`}
          fill="none"
          stroke={STROKE}
          strokeWidth={SW}
          strokeLinejoin="miter"
        />
      )}
      <line x1={38} y1={y} x2={60} y2={y} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

// ── Ground ───────────────────────────────────────────────────────────────────
function groundRender(ctx: SymbolContext): ReactNode {
  const y = ctx.height / 2;
  return (
    <g>
      <line x1={60} y1={y} x2={36} y2={y} stroke={STROKE} strokeWidth={SW} />
      <line x1={36} y1={y - 8} x2={36} y2={y + 8} stroke={STROKE} strokeWidth={SW} />
      <line x1={30} y1={y - 5} x2={30} y2={y + 5} stroke={STROKE} strokeWidth={SW} />
      <line x1={24} y1={y - 3} x2={24} y2={y + 3} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

function peGroundRender(ctx: SymbolContext): ReactNode {
  const cx = ctx.width / 2;
  return (
    <g>
      <line x1={cx} y1={0} x2={cx} y2={18} stroke={STROKE} strokeWidth={SW} />
      <line x1={cx - 12} y1={18} x2={cx + 12} y2={18} stroke={STROKE} strokeWidth={SW} />
      <line x1={cx - 7} y1={24} x2={cx + 7} y2={24} stroke={STROKE} strokeWidth={SW} />
      <line x1={cx - 3} y1={30} x2={cx + 3} y2={30} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

// ── Voltage switch (4 ports: p, n on top row; cp, cn on bottom) ──────────────
function voltageSwitchRender(): ReactNode {
  // bbox 60×60, ports: p(0,10), cp(0,30), n(60,10), cn(60,30)
  return (
    <g>
      <line x1={0} y1={10} x2={20} y2={10} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={10} x2={60} y2={10} stroke={STROKE} strokeWidth={SW} />
      <line x1={20} y1={10} x2={38} y2={2} stroke={STROKE} strokeWidth={SW} />
      <circle cx={20} cy={10} r={1.6} fill={STROKE} />
      <circle cx={40} cy={10} r={1.6} fill={STROKE} />
      <line x1={0} y1={30} x2={22} y2={30} stroke={STROKE} strokeWidth={SW} strokeDasharray="2 2" />
      <line
        x1={38}
        y1={30}
        x2={60}
        y2={30}
        stroke={STROKE}
        strokeWidth={SW}
        strokeDasharray="2 2"
      />
      <line
        x1={22}
        y1={30}
        x2={38}
        y2={30}
        stroke={STROKE}
        strokeWidth={SW * 0.8}
        strokeDasharray="3 2"
      />
      {/* No "ctrl" caption. The dashed coupling line already says this pair
          is the control, every schematic reader knows that convention, and
          the block's own designator is printed above the symbol. Spelled out,
          it read as a separate unwired part sitting under the switch — and it
          rotated with the symbol, landing on its side on a vertical switch. */}
    </g>
  );
}

// ── Current switch (2 ports) ─────────────────────────────────────────────────
function currentSwitchRender(ctx: SymbolContext): ReactNode {
  const y = ctx.height / 2;
  return (
    <g>
      <line x1={0} y1={y} x2={20} y2={y} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={y} x2={60} y2={y} stroke={STROKE} strokeWidth={SW} />
      <line x1={20} y1={y} x2={38} y2={y - 8} stroke={STROKE} strokeWidth={SW} />
      <circle cx={20} cy={y} r={1.6} fill={STROKE} />
      <circle cx={40} cy={y} r={1.6} fill={STROKE} />
      <text x={30} y={y - 12} fontSize={8} textAnchor="middle" fill={STROKE}>
        CSW
      </text>
    </g>
  );
}

// ── Ideal switch (3 ports: d/g/s -- gate-controlled, bbox 80×110) ───────────
//
// `passive.switch.ideal`'s own metadata lists `passive.switch.voltage` among its
// `aliases` (search/picker text, e.g. "this is like a voltage-controlled switch"), and
// `getSchematicSymbol` walks metadata.name, metadataType, *then every alias* looking for a
// registry hit. Before this entry existed there was no `"passive.switch.ideal"` key, so the
// lookup fell through to the `"passive.switch.voltage"` alias and silently rendered this
// block with *that* type's symbol -- a real, different 4-port device (p/cp/n/cn at fixed
// y=10/30) whose hardcoded geometry has no relationship to this type's actual 3 ports.
// Visible on a single instance (rows 2/4) but easy to miss; unmissable at 16 instances
// (row 8), which is what surfaced it.
//
// A first fix (D/gate/S left-to-right, gate below) reconnected the artwork to the real
// ports but kept the ports themselves horizontal -- D/S left-right, gate below spanning
// most of the width -- which reads as nothing like a real switch symbol (feedback: "I have
// never seen that anywhere", drain/source/gate all horizontal). The project already has a
// real MOSFET glyph, faithfully traced from the user's own draw.io reference
// (`mosfetSymbol` above, ports: D top, S bottom, gate left) and previously validated by the
// user in this exact form. Rather than invent new geometry, this reuses that artwork
// directly, at its native size -- an earlier version wrapped it in `scale(0.75)` to shrink
// the footprint, but an SVG `transform="scale()"` shrinks *stroke width too*, so on top of
// this file's own SW already being redefined to match WIRE_STROKE (see the constant above),
// that 0.75x wrapper silently undid it again for this one symbol, reintroducing the exact
// "component lines thinner than wire lines" mismatch as a second, compounding bug. Drawing
// at native size avoids the whole class of problem. `d`/`g`/`s` port offsets in
// metadata.yaml are `semi.mosfet.n`'s own (51 top, 81 left, 51 bottom) unchanged, and bbox
// is the same [80, 110].
function idealSwitchRender(): ReactNode {
  return mosfetSymbol("n", false, false);
}

// ── BJT (user-drawn, bbox 80×80) ────────────────────────────────────────────
//
// Geometry from the user's draw.io files:
//   spice-primitive-N-BJT.drawio.svg  /  spice-primitive-P-BJT.drawio.svg
// Body bounds: draw.io [x:130-494, y:100-470] → bbox [80×80]
//
// Port layout — C exits TOP (offset 46), E exits BOTTOM (offset 46),
// B exits LEFT (offset 41). Vertical layout, same convention as the MOSFET.
//
// N-BJT and P-BJT share one helper; the only visual difference is the
// emitter arrow direction:
//   NPN: arrow points outward toward E (tip at x=44)
//   PNP: arrow points inward toward base bar (tip at x=37)

function bjtSymbol(kind: "npn" | "pnp"): ReactNode {
  const isNPN = kind === "npn";
  return (
    <g>
      {/* Base lead */}
      <line x1={0} y1={41} x2={29} y2={41} stroke={STROKE} strokeWidth={SW} />
      {/* Base bar */}
      <line
        x1={29}
        y1={24}
        x2={29}
        y2={58}
        stroke={STROKE}
        strokeWidth={SW * 1.2}
        strokeLinecap="square"
      />
      {/* Collector leg */}
      <line
        x1={29}
        y1={31}
        x2={46}
        y2={14}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
      />
      {/* C exit: collector junction → C pin at top */}
      <line x1={46} y1={14} x2={46} y2={0} stroke={STROKE} strokeWidth={SW} />
      {/* Emitter leg */}
      <line
        x1={29}
        y1={50}
        x2={46}
        y2={67}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
      />
      {/* E exit: emitter junction → E pin at bottom */}
      <line x1={46} y1={67} x2={46} y2={80} stroke={STROKE} strokeWidth={SW} />
      {/* Emitter arrow
           NPN: tip at (44,62), wings at (37,58) and (37,65) — points outward toward E
           PNP: tip at (37,62), wings at (44,59) and (44,66) — points inward toward base */}
      {isNPN ? (
        <polygon points="44,62 37,58 37,65" fill={STROKE} stroke="none" />
      ) : (
        <polygon points="37,62 44,59 44,66" fill={STROKE} stroke="none" />
      )}
      {/* Circle body */}
      <circle cx={40} cy={40} r={40} fill="none" stroke={STROKE} strokeWidth={SW * 0.8} />
    </g>
  );
}

function bjtRender(kind: "npn" | "pnp"): ReactNode {
  return bjtSymbol(kind);
}
function bjtRenderPE(kind: "npn" | "pnp"): ReactNode {
  return bjtSymbol(kind);
}

// ── MOSFET (user-drawn, bbox 80×110) ─────────────────────────────────────────
//
// Geometry faithfully reproduced from the user's draw.io files:
//   spice-primitive.N-MOS.svg  /  spice-primitive-P-MOS.drawio.svg
// Coordinate transform: draw.io body [x:140-420, y:110-490] → bbox [80×110]
//
// All MOSFET variants share one helper. Differences between N and P:
//   • bulk arrow direction  (N opens right toward channel, P opens left)
//   • D/S contact triangle  (N apex up at y=41, P apex down at y=65)
//
// Port layout — D exits TOP (offset 51), S exits BOTTOM (offset 51),
// G exits LEFT (offset 81). Bulk exits LEFT (offset 58) for 4-terminal only.

function mosfetSymbol(channel: "n" | "p", withBulk: boolean, withBodyDiode = false): ReactNode {
  const isN = channel === "n";

  // Triangle (D/S contact on the right side of the symbol)
  // NMOS: apex up at (69,41), base at y=61
  // PMOS: apex down at (69,65), base at y=45
  const triApexY = isN ? 41 : 65;
  const triBaseY = isN ? 61 : 45;
  const rightDy2 = isN ? triApexY : triBaseY; // top bar → D contact
  const rightSy1 = isN ? triBaseY : triApexY; // S contact → bottom bar

  // Bulk arrow vertex and wing x-positions
  // NMOS: vertex at channel (x=26), wings open right to x=37
  // PMOS: vertex at S-path  (x=51), wings open left  to x=40
  const arrowVx = isN ? 26 : 51;
  const arrowWx = isN ? 37 : 40;

  // Circle centre moves slightly between N and P to match user drawing
  const circleCy = isN ? 55 : 52;

  return (
    <g>
      {/* Gate lead */}
      <line x1={0} y1={81} x2={17} y2={81} stroke={STROKE} strokeWidth={SW} />
      {/* Gate insulator bar */}
      <line
        x1={17}
        y1={35}
        x2={17}
        y2={81}
        stroke={STROKE}
        strokeWidth={SW * 1.2}
        strokeLinecap="square"
      />

      {/* Channel: three segments at x=26 (enhancement-mode gaps) */}
      <line
        x1={26}
        y1={29}
        x2={26}
        y2={41}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="square"
      />
      <line
        x1={26}
        y1={52}
        x2={26}
        y2={64}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="square"
      />
      <line
        x1={26}
        y1={75}
        x2={26}
        y2={87}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="square"
      />

      {/* Horizontal bars linking channel to D/S contacts */}
      <line x1={26} y1={29} x2={69} y2={29} stroke={STROKE} strokeWidth={SW} />
      <line x1={26} y1={87} x2={69} y2={87} stroke={STROKE} strokeWidth={SW} />

      {/* D exit: D pin (top) → top bar */}
      <line x1={51} y1={0} x2={51} y2={29} stroke={STROKE} strokeWidth={SW} />
      {/* S exit: bottom bar → S pin (bottom) */}
      <line x1={51} y1={87} x2={51} y2={110} stroke={STROKE} strokeWidth={SW} />

      {/* Body connect: channel (26,58) → S-path (51,58) */}
      <line x1={26} y1={58} x2={51} y2={58} stroke={STROKE} strokeWidth={SW} />
      {/* S-body vertical: body junction → bottom bar */}
      <line x1={51} y1={58} x2={51} y2={87} stroke={STROKE} strokeWidth={SW} />

      {/* Right-side D stub: top bar → triangle D-contact */}
      <line x1={69} y1={29} x2={69} y2={rightDy2} stroke={STROKE} strokeWidth={SW} />
      {/* Right-side S stub: triangle S-contact → bottom bar */}
      <line x1={69} y1={rightSy1} x2={69} y2={87} stroke={STROKE} strokeWidth={SW} />

      {/* Triangle */}
      <line x1={69} y1={triApexY} x2={57} y2={triBaseY} stroke={STROKE} strokeWidth={SW} />
      <line x1={69} y1={triApexY} x2={80} y2={triBaseY} stroke={STROKE} strokeWidth={SW} />
      <line x1={57} y1={triBaseY} x2={80} y2={triBaseY} stroke={STROKE} strokeWidth={SW} />
      {/* Horizontal bar at apex level */}
      <line x1={60} y1={triApexY} x2={77} y2={triApexY} stroke={STROKE} strokeWidth={SW} />

      {/* Bulk arrow (V-shape, two lines) */}
      <line x1={arrowVx} y1={58} x2={arrowWx} y2={52} stroke={STROKE} strokeWidth={SW} />
      <line x1={arrowVx} y1={58} x2={arrowWx} y2={64} stroke={STROKE} strokeWidth={SW} />

      {/* External bulk lead — 4-terminal only */}
      {withBulk && <line x1={0} y1={58} x2={26} y2={58} stroke={STROKE} strokeWidth={SW} />}

      {/* Internal body diode — VDMOS only */}
      {withBodyDiode && (
        <g>
          {/* Cathode bar (D side) */}
          <line x1={51} y1={29} x2={51} y2={33} stroke={STROKE} strokeWidth={SW * 0.8} />
          <line x1={48} y1={33} x2={54} y2={33} stroke={STROKE} strokeWidth={SW * 0.8} />
          {/* Triangle (tip up = cathode, base down = anode) */}
          <polygon points="48,40 54,40 51,33" fill={FILL} stroke={STROKE} strokeWidth={SW * 0.7} />
          {/* Anode connects to body-tie path at (51,44) which is ≈ body y=58 region */}
          <line x1={51} y1={40} x2={51} y2={44} stroke={STROKE} strokeWidth={SW * 0.8} />
        </g>
      )}

      {/* Circle body */}
      <circle cx={47} cy={circleCy} r={51} fill="none" stroke={STROKE} strokeWidth={SW * 0.8} />
    </g>
  );
}

// Convenience wrappers used by SCHEMATIC_SYMBOLS
function nmosfetRender(): ReactNode {
  return mosfetSymbol("n", false, false);
}
function pmosfetRender(ctx: SymbolContext): ReactNode {
  return (
    <PmosSvg
      width={ctx.width}
      height={ctx.height}
      preserveAspectRatio="xMidYMid meet"
      color={STROKE}
    />
  );
}
function nmosfetRenderPE(): ReactNode {
  return mosfetSymbol("n", false, false);
}
function pmosfetRenderPE(): ReactNode {
  return mosfetSymbol("p", false, false);
}
function vdmosRender(): ReactNode {
  return mosfetSymbol("n", false, true);
}

// ── JFET (user-drawn, bbox 80×80) ────────────────────────────────────────────
//
// Geometry from spice-primitive-N-JFET.drawio.svg / P-JFET.drawio.svg.
// Body x=[140,472] y=[110,450] → bbox 80×80.
// Like the MESFET: gate arrow touches channel directly (no oxide gap).
// NJFET: arrow tip at x=20 (channel side), pointing right (inward).
// PJFET: arrow tip at x=14 (channel side), pointing right — user drew both
//        arrows in the same direction; same visual, different gate offset.
// G exits LEFT (offset 42), D exits TOP (offset 43), S exits BOTTOM (offset 43).

function jfetSymbol(kind: "n" | "p"): ReactNode {
  const isN = kind === "n";
  // N-JFET: gate lead (0,42)→(14,42), bridge (22,42)→(20,42), arrow tip (20,43)
  // P-JFET: gate lead (0,42)→(8,42),  bridge (22,42)→(14,42), arrow tip (14,43)
  const leadX = isN ? 14 : 8; // gate lead inner x
  const bridgeX = isN ? 20 : 14; // channel-to-arrow bridge inner x
  const arrowW1 = isN ? [14, 40] : [8, 40]; // arrow wing 1 [x,y]
  const arrowW2 = isN ? [14, 45] : [8, 45]; // arrow wing 2
  const circleCy = isN ? 40 : 41;

  return (
    <g>
      {/* Gate lead */}
      <line x1={0} y1={42} x2={leadX} y2={42} stroke={STROKE} strokeWidth={SW} />
      {/* Gate arrow: tip touches channel bar, opens toward channel */}
      <polygon
        points={`${arrowW1[0]},${arrowW1[1]} ${bridgeX},43 ${arrowW2[0]},${arrowW2[1]}`}
        fill={STROKE}
        stroke="none"
      />
      {/* Short bridge from channel bar to arrow tip */}
      <line x1={22} y1={42} x2={bridgeX} y2={42} stroke={STROKE} strokeWidth={SW} />
      {/* Channel bar — continuous (junction gate) */}
      <line
        x1={22}
        y1={18}
        x2={22}
        y2={67}
        stroke={STROKE}
        strokeWidth={SW * 1.2}
        strokeLinecap="square"
      />
      {/* Top horizontal bar: channel → D exit */}
      <line x1={22} y1={24} x2={43} y2={24} stroke={STROKE} strokeWidth={SW} />
      {/* Bottom horizontal bar: channel → S exit */}
      <line x1={22} y1={61} x2={43} y2={61} stroke={STROKE} strokeWidth={SW} />
      {/* D exit: D pin (top) → top bar */}
      <line x1={43} y1={0} x2={43} y2={24} stroke={STROKE} strokeWidth={SW} />
      {/* S exit: bottom bar → S pin (bottom) */}
      <line x1={43} y1={61} x2={43} y2={80} stroke={STROKE} strokeWidth={SW} />
      {/* Circle body */}
      <circle cx={41} cy={circleCy} r={39} fill="none" stroke={STROKE} strokeWidth={SW * 0.8} />
    </g>
  );
}

function jfetRender(kind: "n" | "p"): ReactNode {
  return jfetSymbol(kind);
}

// ── MESFET-N (user-drawn, bbox 56×106) ─────────────────────────────────────
// Geometry from: spice-primitive-MESFET.drawio.svg
// No circle body. Channel bar at x=28. Schottky gate arrow touches channel
// directly (no oxide gap). G exits LEFT (offset 56), D exits TOP (offset 56),
// S exits BOTTOM (offset 56).
function mesfetRender(): ReactNode {
  return (
    <g>
      {/* Gate lead */}
      <line x1={0} y1={56} x2={18} y2={56} stroke={STROKE} strokeWidth={SW} />
      {/* Short bridge from channel bar to arrow tip */}
      <line x1={28} y1={56} x2={26} y2={56} stroke={STROKE} strokeWidth={SW} />
      {/* Gate arrow: tip at (26,56), wings at (18,52) and (18,60) */}
      <polygon points="18,52 26,56 18,60" fill={STROKE} stroke="none" />
      {/* Channel bar (continuous — Schottky junction, no oxide gap) */}
      <line
        x1={28}
        y1={31}
        x2={28}
        y2={81}
        stroke={STROKE}
        strokeWidth={SW * 1.2}
        strokeLinecap="square"
      />
      {/* Top horizontal bar: channel → D exit */}
      <line x1={28} y1={31} x2={56} y2={31} stroke={STROKE} strokeWidth={SW} />
      {/* Bottom horizontal bar: channel → S exit */}
      <line x1={28} y1={81} x2={56} y2={81} stroke={STROKE} strokeWidth={SW} />
      {/* D exit: D pin (top) → top bar */}
      <line x1={56} y1={0} x2={56} y2={31} stroke={STROKE} strokeWidth={SW} />
      {/* S exit: bottom bar → S pin (bottom) */}
      <line x1={56} y1={81} x2={56} y2={106} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

// ── IGBT-N physical-electrical ────────────────────────────────────────────────
// bbox 70×40 — g@left/20  c@right/12  e@right/28
// MOSFET-like gate insulator + channel feeding a BJT output stage (base bar +
// collector/emitter legs). Emitter arrow in NPN direction.
function igbtRender(): ReactNode {
  return (
    <g>
      {/* Gate lead */}
      <line x1={0} y1={20} x2={19} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* Gate insulator bar */}
      <line
        x1={20}
        y1={14}
        x2={20}
        y2={26}
        stroke={STROKE}
        strokeWidth={2.5}
        strokeLinecap="square"
      />
      {/* Channel segments */}
      <line
        x1={23}
        y1={14}
        x2={23}
        y2={17}
        stroke={STROKE}
        strokeWidth={2}
        strokeLinecap="square"
      />
      <line
        x1={23}
        y1={20}
        x2={23}
        y2={21}
        stroke={STROKE}
        strokeWidth={2}
        strokeLinecap="square"
      />
      <line
        x1={23}
        y1={23}
        x2={23}
        y2={26}
        stroke={STROKE}
        strokeWidth={2}
        strokeLinecap="square"
      />
      {/* Internal base/body bar */}
      <line
        x1={33}
        y1={15}
        x2={33}
        y2={25}
        stroke={STROKE}
        strokeWidth={3}
        strokeLinecap="square"
      />
      {/* Channel center → body bar */}
      <line x1={23} y1={20} x2={33} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* Collector leg */}
      <line
        x1={33}
        y1={16}
        x2={70}
        y2={12}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
      />
      {/* Emitter leg */}
      <line
        x1={33}
        y1={24}
        x2={70}
        y2={28}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
      />
      {/* NPN emitter arrow: tip toward E */}
      <polygon points="63,27 59,29 59,25" fill={STROKE} stroke="none" />
      {/* Circle body */}
      <circle cx={52} cy={20} r={14} fill="none" stroke={STROKE} strokeWidth={SW * 0.8} />
    </g>
  );
}

// ── Logic gates (MIL-STD-806B / ANSI distinctive shapes) ─────────────────────
//
// One geometry function shared by every gate op (`logic.gate`'s own `op` param,
// plus the fixed-op `signal-flow.logic.and/or/not` siblings) — computed from the
// symbol's actual width/height rather than hand-picked per-instance numbers, so
// it stays correct if a gate's bbox ever grows (more inputs via `n_operands`).
function logicGateGeometry(op: string, w: number, h: number): ReactNode {
  const hasBubble = op === "nand" || op === "nor" || op === "xnor" || op === "not";
  const bubbleR = Math.min(5, h * 0.14);
  const bodyW = hasBubble ? w - 2 * bubbleR : w;
  const bubbleCx = w - bubbleR;
  const strokeProps = { stroke: STROKE, strokeWidth: SW, strokeLinejoin: "round" as const };

  if (op === "not") {
    return (
      <g>
        <polygon points={`0,0 0,${h} ${bodyW},${h / 2}`} fill={FILL} {...strokeProps} />
        {hasBubble && (
          <circle
            cx={bubbleCx}
            cy={h / 2}
            r={bubbleR}
            fill={FILL}
            stroke={STROKE}
            strokeWidth={SW}
          />
        )}
      </g>
    );
  }

  if (op === "and" || op === "nand") {
    const r = h / 2;
    const flat = Math.max(bodyW - r, r * 0.2);
    const d = `M 0 0 L ${flat} 0 A ${r} ${r} 0 0 1 ${flat} ${h} L 0 ${h} Z`;
    return (
      <g>
        <path d={d} fill={FILL} {...strokeProps} />
        {hasBubble && (
          <circle
            cx={bubbleCx}
            cy={h / 2}
            r={bubbleR}
            fill={FILL}
            stroke={STROKE}
            strokeWidth={SW}
          />
        )}
      </g>
    );
  }

  // or / nor / xor / xnor — shield shape: a concave back curve and two curves
  // bowing out from the back corners to a point at the front. XOR/XNOR add a
  // second, matching back curve just ahead of the main one.
  const isXor = op === "xor" || op === "xnor";
  const shift = isXor ? Math.min(7, h * 0.16) : 0;
  const bw = bodyW - shift;
  const backBulge = h * 0.22;
  const bodyPath =
    `M ${shift} 0 ` +
    `C ${shift + bw * 0.35} 0 ${shift + bw * 0.72} ${h * 0.14} ${shift + bw} ${h / 2} ` +
    `C ${shift + bw * 0.72} ${h * 0.86} ${shift + bw * 0.35} ${h} ${shift} ${h} ` +
    `C ${shift + backBulge} ${h} ${shift + backBulge} 0 ${shift} 0 Z`;
  return (
    <g>
      <path d={bodyPath} fill={FILL} {...strokeProps} />
      {isXor && (
        <path
          d={`M 0 0 C ${backBulge} 0 ${backBulge} ${h} 0 ${h}`}
          fill="none"
          stroke={STROKE}
          strokeWidth={SW}
        />
      )}
      {hasBubble && (
        <circle cx={bubbleCx} cy={h / 2} r={bubbleR} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      )}
    </g>
  );
}

function logicGateRender(ctx: SymbolContext): ReactNode {
  const op = typeof ctx.params.op === "string" ? ctx.params.op : "and";
  return logicGateGeometry(op, ctx.width, ctx.height);
}

// ── Flip-flop (rectangle + clock chevron at the clk pin) ─────────────────────
// logic.flip_flop's clk port sits at left/offset=19 (bbox 60x132) — every real
// flip-flop/latch symbol convention (IEEE 91-1984 included) is a plain labeled
// rectangle; the one thing that convention adds beyond a generic box is a small
// chevron at the clock pin marking it edge-triggered.
function flipFlopRender(ctx: SymbolContext): ReactNode {
  const { width: w, height: h, params } = ctx;
  const kind = typeof params.kind === "string" ? params.kind : "dff";
  const clkY = 19;
  const chevron = 7;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <polygon
        points={`0,${clkY - chevron / 2} ${chevron},${clkY} 0,${clkY + chevron / 2}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
      />
      <text x={w / 2} y={h / 2} fontSize={13} textAnchor="middle" fill={STROKE}>
        {kind}
      </text>
    </g>
  );
}

// ── Hysteresis / Schmitt trigger (box + hysteresis-loop glyph) ───────────────
function hysteresisRender(ctx: SymbolContext): ReactNode {
  const { width: w, height: h } = ctx;
  const cx = w / 2;
  const cy = h / 2;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      {/* A small hysteresis-loop icon (the universal Schmitt-trigger glyph). */}
      <path
        d={`M ${cx - 10} ${cy + 6} L ${cx - 3} ${cy + 6} L ${cx - 3} ${cy - 6} L ${cx + 10} ${cy - 6}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW * 0.9}
      />
      <path
        d={`M ${cx - 10} ${cy - 6} L ${cx - 3} ${cy - 6} L ${cx - 3} ${cy + 6} L ${cx + 10} ${cy + 6}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW * 0.9}
        strokeDasharray="1.5 1.5"
      />
    </g>
  );
}

// ── Wrappers for sources by family ───────────────────────────────────────────
// The glyph takes the context as well as its centre line so a glyph that
// draws lettering (the DC pair) can keep it upright under rotation. Glyphs
// that are pure artwork ignore the second argument.
type SourceGlyph = (y: number, ctx: SymbolContext) => ReactNode;

function voltageSource(glyph: SourceGlyph): SchematicSymbol {
  return {
    valueParam: "V",
    unit: "V",
    render: (ctx) => sourceCircle(ctx, glyph(ctx.height / 2, ctx)),
  };
}

function currentSource(glyph: SourceGlyph): SchematicSymbol {
  return {
    valueParam: "I",
    unit: "A",
    render: (ctx) => sourceCircle(ctx, glyph(ctx.height / 2, ctx)),
  };
}

// ── CCVS (user-drawn, bbox 80×60) ─────────────────────────────────────────────
// spice-primitive-CCVS.drawio.svg. Circle on the left, two output terminals
// both on the RIGHT face. p right/1, n right/59.
function ccvsRender(ctx: SymbolContext): ReactNode {
  return (
    <g>
      {/* Top bar: circle area → right terminal */}
      <line x1={12} y1={1} x2={80} y2={1} stroke={STROKE} strokeWidth={SW} />
      {/* Bottom bar */}
      <line x1={12} y1={59} x2={80} y2={59} stroke={STROKE} strokeWidth={SW} />
      {/* Left vertical stubs entering circle from above and below */}
      <line x1={12} y1={0} x2={12} y2={18} stroke={STROKE} strokeWidth={SW} />
      <line x1={12} y1={42} x2={12} y2={60} stroke={STROKE} strokeWidth={SW} />
      {/* Circle (voltage source symbol) */}
      <circle cx={12} cy={29} r={13} fill={FILL} stroke={STROKE} strokeWidth={SW * 0.8} />
      {/* + and − polarity glyphs */}
      <UprightText ctx={ctx} x={12} y={23} textAnchor="middle" fontSize={10} fill={STROKE}>
        +
      </UprightText>
      <UprightText ctx={ctx} x={12} y={38} textAnchor="middle" fontSize={12} fill={STROKE}>
        −
      </UprightText>
    </g>
  );
}

// ── CCCS (user-drawn, bbox 80×60) ─────────────────────────────────────────────
// spice-primitive-CCCS.drawio.svg. Vertical bar on the left with a current
// arrow; both output terminals on the RIGHT. p right/1, n right/59.
function cccsRender(): ReactNode {
  return (
    <g>
      {/* Vertical bar */}
      <line x1={5} y1={0} x2={5} y2={60} stroke={STROKE} strokeWidth={SW} />
      {/* Top bar */}
      <line x1={5} y1={1} x2={80} y2={1} stroke={STROKE} strokeWidth={SW} />
      {/* Bottom bar */}
      <line x1={5} y1={59} x2={80} y2={59} stroke={STROKE} strokeWidth={SW} />
      {/* Current direction arrow: tip at (11,30) pointing right */}
      <polygon points="0,20 11,30 0,39" fill={STROKE} stroke="none" />
    </g>
  );
}

// ── VCVS (user-drawn, bbox 120×44) ────────────────────────────────────────────
// spice-primitive-VCVS.drawio.svg. Two circles connected by a bridge.
// LEFT circle = voltage-sensing input (cp left/1, cn left/43).
// RIGHT circle = voltage output (p right/1, n right/43).
function vcvsRender(ctx: SymbolContext): ReactNode {
  return (
    <g>
      {/* ── Left circle group (control input) ── */}
      <line x1={0} y1={1} x2={46} y2={1} stroke={STROKE} strokeWidth={SW} />
      <line x1={0} y1={43} x2={46} y2={43} stroke={STROKE} strokeWidth={SW} />
      <line x1={45} y1={0} x2={45} y2={13} stroke={STROKE} strokeWidth={SW} />
      <line x1={45} y1={30} x2={45} y2={44} stroke={STROKE} strokeWidth={SW} />
      <circle cx={45} cy={21} r={9} fill={FILL} stroke={STROKE} strokeWidth={SW * 0.8} />
      {/* ── Bridge between circles ── */}
      <line x1={54} y1={21} x2={74} y2={21} stroke={STROKE} strokeWidth={SW} />
      {/* ── Right circle group (voltage output) ── */}
      <line x1={81} y1={1} x2={120} y2={1} stroke={STROKE} strokeWidth={SW} />
      <line x1={81} y1={43} x2={120} y2={43} stroke={STROKE} strokeWidth={SW} />
      <line x1={82} y1={0} x2={82} y2={13} stroke={STROKE} strokeWidth={SW} />
      <line x1={82} y1={30} x2={82} y2={44} stroke={STROKE} strokeWidth={SW} />
      <circle cx={82} cy={21} r={9} fill={FILL} stroke={STROKE} strokeWidth={SW * 0.8} />
      {/* + / − polarity on output circle */}
      <UprightText ctx={ctx} x={82} y={18} textAnchor="middle" fontSize={7} fill={STROKE}>
        +
      </UprightText>
      <UprightText ctx={ctx} x={82} y={27} textAnchor="middle" fontSize={9} fill={STROKE}>
        −
      </UprightText>
    </g>
  );
}

// ── VCCS (user-drawn, bbox 120×44) ────────────────────────────────────────────
// spice-primitive-VCCS.drawio.svg. LEFT circle (voltage input) + RIGHT
// vertical bar with current arrow (current output).
// cp left/1, cn left/43, p right/1, n right/43.
function vccsRender(): ReactNode {
  return (
    <g>
      {/* ── Left circle group (voltage-sensing input) — same as VCVS ── */}
      <line x1={0} y1={1} x2={46} y2={1} stroke={STROKE} strokeWidth={SW} />
      <line x1={0} y1={43} x2={46} y2={43} stroke={STROKE} strokeWidth={SW} />
      <line x1={45} y1={0} x2={45} y2={13} stroke={STROKE} strokeWidth={SW} />
      <line x1={45} y1={30} x2={45} y2={44} stroke={STROKE} strokeWidth={SW} />
      <circle cx={45} cy={21} r={9} fill={FILL} stroke={STROKE} strokeWidth={SW * 0.8} />
      {/* ── Bridge to current source ── */}
      <line x1={54} y1={21} x2={70} y2={21} stroke={STROKE} strokeWidth={SW} />
      {/* ── Right group: vertical bar with current arrow ── */}
      <line x1={74} y1={0} x2={74} y2={44} stroke={STROKE} strokeWidth={SW} />
      <line x1={74} y1={1} x2={120} y2={1} stroke={STROKE} strokeWidth={SW} />
      <line x1={74} y1={43} x2={120} y2={43} stroke={STROKE} strokeWidth={SW} />
      {/* Current arrow: tip at (77,21) pointing right */}
      <polygon points="70,14 77,21 70,28" fill={STROKE} stroke="none" />
    </g>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────
export const SCHEMATIC_SYMBOLS: Record<string, SchematicSymbol> = {
  // Passives
  "passive.resistor": {
    valueParam: "R",
    unit: "Ω",
    render: (ctx) => (
      <path
        d={resistorPath(ctx.height / 2)}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  "passive.capacitor": {
    valueParam: "C",
    unit: "F",
    render: (ctx) => (
      <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
        {capacitorPaths(ctx.height / 2, 9).map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    ),
  },
  "passive.capacitor.behavioral": {
    valueParam: "C",
    unit: "F",
    staticLabel: "C(expr)",
    render: (ctx) => (
      <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round">
        {capacitorPaths(ctx.height / 2, 9).map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    ),
  },
  "passive.capacitor.semiconductor": {
    valueParam: "C",
    unit: "F",
    staticLabel: "C(semi)",
    render: (ctx) => (
      <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round">
        {capacitorPaths(ctx.height / 2, 9).map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    ),
  },
  "passive.inductor": {
    valueParam: "L",
    unit: "H",
    render: (ctx) => (
      <path
        d={inductorPath(ctx.height / 2)}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
      />
    ),
  },
  "passive.inductor.coupled": {
    render: (ctx) => coupledInductorRender(ctx),
  },
  "passive.switch.voltage": {
    render: () => voltageSwitchRender(),
  },
  "passive.switch.current": {
    render: (ctx) => currentSwitchRender(ctx),
  },
  "passive.switch.ideal": {
    render: () => idealSwitchRender(),
  },

  // Ground
  "signal_flow.source.ground": {
    staticLabel: "GND",
    render: (ctx) => groundRender(ctx),
  },
  "physical_electrical.reference.ground": {
    staticLabel: "GND",
    render: (ctx) => peGroundRender(ctx),
  },

  // Voltage sources
  "source.voltage.dc": voltageSource(dcVoltageGlyph),
  "physical_electrical.source.voltage_dc": voltageSource(dcVoltageGlyph),
  "source.voltage.sin": voltageSource(sineGlyph),
  "source.voltage.ac": voltageSource(sineGlyph),
  "physical_electrical.source.voltage_ac": voltageSource(sineGlyph),
  "source.voltage.pulse": voltageSource(pulseGlyph),
  "source.voltage.exp": voltageSource(expGlyph),
  "source.voltage.pwl": voltageSource(pwlGlyph),
  "source.voltage.sffm": voltageSource(sineGlyph),
  "source.voltage.am": voltageSource(sineGlyph),
  "source.voltage.noise": voltageSource(noiseGlyph),
  "source.voltage.random": voltageSource(noiseGlyph),
  "source.voltage.rf_port": voltageSource(sineGlyph),

  // Current sources
  "source.current.dc": currentSource(currentArrowGlyph),
  "physical_electrical.source.current_dc": currentSource(currentArrowGlyph),
  "source.current.sin": currentSource(sineGlyph),
  "source.current.ac": currentSource(sineGlyph),
  "physical_electrical.source.current_ac": currentSource(sineGlyph),
  "source.current.pulse": currentSource(pulseGlyph),
  "source.current.exp": currentSource(expGlyph),
  "source.current.pwl": currentSource(pwlGlyph),
  "source.current.sffm": currentSource(sineGlyph),
  "source.current.am": currentSource(sineGlyph),

  // Diodes
  "semi.diode": {
    staticLabel: "D",
    render: (ctx) => diodeRender(ctx, "standard"),
  },
  "physical_electrical.semiconductor.diode": {
    staticLabel: "D",
    render: (ctx) => diodeRender(ctx, "standard"),
  },
  "semi.diode.zener": {
    staticLabel: "Zener",
    render: (ctx) => diodeRender(ctx, "zener"),
  },

  // BJTs
  "semi.bjt.npn": {
    staticLabel: "NPN",
    render: () => bjtRender("npn"),
  },
  "physical_electrical.semiconductor.bjt_npn": {
    staticLabel: "NPN",
    render: () => bjtRenderPE("npn"),
  },
  "semi.bjt.pnp": {
    staticLabel: "PNP",
    render: () => bjtRender("pnp"),
  },
  "physical_electrical.semiconductor.bjt_pnp": {
    staticLabel: "PNP",
    render: () => bjtRenderPE("pnp"),
  },

  // MOSFETs
  "semi.mosfet.n": {
    staticLabel: "NMOS",
    render: () => nmosfetRender(),
  },
  "physical_electrical.semiconductor.mosfet_n": {
    staticLabel: "NMOS",
    render: () => nmosfetRenderPE(),
  },
  "semi.mosfet.p": {
    staticLabel: "PMOS",
    render: (ctx) => pmosfetRender(ctx),
  },
  "physical_electrical.semiconductor.mosfet_p": {
    staticLabel: "PMOS",
    render: () => pmosfetRenderPE(),
  },
  "semi.mosfet.vdmos": {
    staticLabel: "VDMOS",
    render: () => vdmosRender(),
  },

  // JFETs
  "semi.jfet.n": {
    staticLabel: "NJFET",
    render: () => jfetRender("n"),
  },
  "semi.jfet.p": {
    staticLabel: "PJFET",
    render: () => jfetRender("p"),
  },

  // MESFET
  "semi.mesfet.n": {
    staticLabel: "MESFET",
    render: () => mesfetRender(),
  },

  // IGBT
  "physical_electrical.semiconductor.igbt_n": {
    staticLabel: "IGBT",
    render: () => igbtRender(),
  },

  // Dependent sources — CC
  "physical_electrical.source.ccvs": { staticLabel: "CCVS", render: (ctx) => ccvsRender(ctx) },
  "source.dependent.ccvs": { staticLabel: "CCVS", render: (ctx) => ccvsRender(ctx) },
  "physical_electrical.source.cccs": { staticLabel: "CCCS", render: () => cccsRender() },
  "source.dependent.cccs": { staticLabel: "CCCS", render: () => cccsRender() },

  // Dependent sources — VC
  "source.dependent.vcvs": { staticLabel: "VCVS", render: (ctx) => vcvsRender(ctx) },
  "physical_electrical.source.vcvs": { staticLabel: "VCVS", render: (ctx) => vcvsRender(ctx) },
  "source.dependent.vccs": { staticLabel: "VCCS", render: () => vccsRender() },
  "physical_electrical.source.vccs": { staticLabel: "VCCS", render: () => vccsRender() },

  // Logic gates — one op-parameterized type plus the fixed-op legacy siblings
  "logic.gate": { staticLabel: "", render: (ctx) => logicGateRender(ctx) },
  "signal_flow.logic.and": {
    staticLabel: "",
    render: (ctx) => logicGateGeometry("and", ctx.width, ctx.height),
  },
  "signal-flow.logic.and": {
    staticLabel: "",
    render: (ctx) => logicGateGeometry("and", ctx.width, ctx.height),
  },
  "signal_flow.logic.or": {
    staticLabel: "",
    render: (ctx) => logicGateGeometry("or", ctx.width, ctx.height),
  },
  "signal-flow.logic.or": {
    staticLabel: "",
    render: (ctx) => logicGateGeometry("or", ctx.width, ctx.height),
  },
  "signal_flow.logic.not": {
    staticLabel: "",
    render: (ctx) => logicGateGeometry("not", ctx.width, ctx.height),
  },
  "signal-flow.logic.not": {
    staticLabel: "",
    render: (ctx) => logicGateGeometry("not", ctx.width, ctx.height),
  },

  // Flip-flops / latches / hysteresis
  "logic.flip_flop": { staticLabel: "", render: (ctx) => flipFlopRender(ctx) },
  "logic.hysteresis": { staticLabel: "", render: (ctx) => hysteresisRender(ctx) },

  // ── Catalogue aliases ──────────────────────────────────────────────────────
  //
  // The catalogue carries two spellings of most electrical parts: the short
  // `passive.resistor` and the namespaced `physical_electrical.passive.resistor`.
  // Only the short ones were registered here, so 38 real electrical types —
  // among them the namespaced resistor, capacitor and inductor, the pulse and
  // PWL sources, the transformer and the generic switch — fell through to the
  // generic renderer and drew as a white box with their type name across it,
  // overflowing the box and running over the wires on a rotated part.
  //
  // These are the same symbol under its other name, not new artwork.
  "physical_electrical.passive.resistor": {
    valueParam: "R",
    unit: "Ω",
    render: (ctx) => (
      <path
        d={resistorPath(ctx.height / 2)}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  "passive.resistor.behavioral": {
    valueParam: "R",
    unit: "Ω",
    render: (ctx) => (
      <path
        d={resistorPath(ctx.height / 2)}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  "passive.resistor.semiconductor": {
    valueParam: "R",
    unit: "Ω",
    render: (ctx) => (
      <path
        d={resistorPath(ctx.height / 2)}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  "physical_electrical.passive.capacitor": {
    valueParam: "C",
    unit: "F",
    render: (ctx) => (
      <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
        {capacitorPaths(ctx.height / 2, 9).map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    ),
  },
  "physical_electrical.passive.inductor": {
    valueParam: "L",
    unit: "H",
    render: (ctx) => (
      <path
        d={inductorPath(ctx.height / 2)}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
      />
    ),
  },
  "passive.inductor.behavioral": {
    valueParam: "L",
    unit: "H",
    render: (ctx) => (
      <path
        d={inductorPath(ctx.height / 2)}
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
      />
    ),
  },
  "passive.diode.ideal": { staticLabel: "D", render: (ctx) => diodeRender(ctx, "standard") },
  "physical_electrical.semiconductor.zener": {
    staticLabel: "Z",
    render: (ctx) => diodeRender(ctx, "zener"),
  },
  "physical_electrical.semiconductor.led": {
    staticLabel: "LED",
    render: (ctx) => diodeRender(ctx, "standard"),
  },
  "passive.switch.generic": { render: () => voltageSwitchRender() },
  "physical_electrical.source.voltage_pulse": voltageSource(pulseGlyph),
  "physical_electrical.source.voltage_pwl": voltageSource(pwlGlyph),
  // A transformer is a pair of coupled windings; `passive.inductor.coupled`
  // already draws exactly that, and its ports (p1/n1/p2/n2) match.
  "physical_electrical.passive.transformer": { render: (ctx) => coupledInductorRender(ctx) },
  "physical_electrical.passive.mutual_inductor": { render: (ctx) => coupledInductorRender(ctx) },
  "routing.ground": { staticLabel: "GND", render: (ctx) => peGroundRender(ctx) },
};

export const ELECTRICAL_SYMBOL_COVERAGE: Record<string, "implemented" | "fallback-tracked"> = {
  "physical-electrical.passive.resistor": "implemented",
  "physical-electrical.passive.capacitor": "implemented",
  "physical-electrical.passive.inductor": "implemented",
  "physical-electrical.source.voltage_dc": "implemented",
  "physical-electrical.source.current_dc": "implemented",
  "physical-electrical.semiconductor.diode": "implemented",
  "physical-electrical.semiconductor.mosfet_n": "implemented",
  "physical-electrical.semiconductor.bjt_npn": "implemented",
  "physical-electrical.passive.transformer": "fallback-tracked",
  "physical-electrical.opamp.ideal": "fallback-tracked",
  "physical-electrical.probe.ammeter": "fallback-tracked",
  "physical-electrical.probe.voltmeter": "fallback-tracked",
};

function symbolKeyCandidates(key: string): string[] {
  const normalized = key.replaceAll("physical-electrical", "physical_electrical");
  const denormalized = key.replaceAll("physical_electrical", "physical-electrical");
  const withoutPhysicalPrefix = normalized.startsWith("physical_electrical.")
    ? normalized.slice("physical_electrical.".length)
    : normalized;
  return [key, normalized, denormalized, withoutPhysicalPrefix];
}

export function getSchematicSymbol(
  ...keys: Array<string | undefined>
): SchematicSymbol | undefined {
  for (const key of keys) {
    if (!key) continue;
    for (const candidate of symbolKeyCandidates(key)) {
      const symbol = SCHEMATIC_SYMBOLS[candidate];
      if (symbol) return symbol;
    }
  }
  return undefined;
}
