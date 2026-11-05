# Schematic rendering specification

> **Status:** live contract. `AGENTS.md` invariant 6 points here.

A schematic that simulates correctly but reads like a sketch is a failed
feature. This document is what "reads like a schematic" means here, in terms
precise enough to implement and to argue with.

---

## 0. The method comes first

Rendering quality is the one property the test suite cannot check. No
assertion notices that two labels overlap, that a lead overshoots its symbol,
that a wire crosses a body, or that a stroke is too pale to read. Unit tests
pin down the *arithmetic* underneath — that a bound includes a rail, that a
junction is found, that a designator is stable — and they are worth having,
but they are not evidence that the picture is good.

So:

```sh
node scripts/render-schematic.mjs --doc examples/buck_converter.gsim_sch
```

**Rendering work is not finished until someone has opened the PNG and looked
at it.** Attach a before/after pair to any change that claims to improve
appearance. Every defect listed in §5 was found this way and none of them
would have failed a test.

A corollary: do not diagnose from an old screenshot. The first pass of this
work was nearly misdirected by a checked-in image five months and many fixes
stale, which showed diagonal wires the renderer had long since stopped
drawing.

---

## 1. One unit system

This is the root from which most geometry defects grow.

| Quantity | Value | Where |
| --- | --- | --- |
| Canvas grid | `GRID = 20` | `canvas/router/ortho-route.ts` |
| Symbol magnification | `SYMBOL_SCALE = 2` | `canvas/nodes/port-hit-test.ts` |
| Terminal lead | `STUB_LEN = 20` (one grid unit) | `canvas/nodes/port-hit-test.ts` |

Catalog bboxes and port offsets are multiples of 10 — every two-terminal part
is `[60, 40]` with its ports at offset 20. With `SYMBOL_SCALE = 2` that maps
offsets 10/20/30 to 20/40/60, and a two-terminal part spans
`120 + 2 x 20 = 160 = 8` grid units. **Every terminal, lead tip and component
edge therefore lands on a grid intersection.**

This is a property to preserve, not a coincidence. At the previous values
(1.6 and 16) a port centre landed at 32 and a part spanned 128; nothing was
on grid, every wire met its port at an off-grid point, and `wire-path.ts`
carried a six-pixel `ORTHOGONAL_TOLERANCE_PX` plus a `snapNearOrthogonal`
pass to hide the consequences. If you change `SYMBOL_SCALE`, change it to
another value that keeps the property.

**One definition per quantity.** `STUB_LEN` was once declared twice — in
`Port.tsx`, which draws the lead, and in `port-hit-test.ts`, which decides
where the wire attaches to it. Two constants that must agree, with nothing
checking that they do, drift silently and leave every wire on the sheet short
of the lead it is drawn to touch.

---

## 2. Wires

- **Orthogonal only.** Every segment is horizontal or vertical. A diagonal
  segment is a bug, not a style.
- **Pin-exact.** A wire ends on a lead tip, not near it.
- **Never through a body.** `router/ortho-route.ts` has obstacle avoidance;
  stored waypoints bypass it, so a document can still carry a wire through a
  symbol. Treat that as a document defect and offer to re-route, rather than
  drawing it and hoping.
- **Collinear overlap is fine.** Two wires sharing a port necessarily share
  that port's lead. Identical collinear strokes are invisible; do not add
  machinery to avoid them.

### Junction dots

A dot is the only mark distinguishing a connection from a crossing, so a
missing one is a correctness defect. `edges/junctions.ts` draws one where:

1. three or more wire vertices coincide — **counting endpoints**, which are
   port lead tips, because a three-way node is usually formed by wires that
   *end* at a shared port rather than bending there; or
2. a vertex lands strictly inside another wire's segment — a T, which is how
   a rail is tapped, and which no amount of vertex counting finds.

Two wire *ends* meeting is a port, not a junction: `Port.tsx` already draws
the terminal there. Two wires merely crossing get no dot.

---

## 3. Symbols

- Stroke weight is derived from `WIRE_STROKE`, not hand-picked, so a
  component's outline and the wire entering it are the same weight. A seam at
  the port reads as a defect even when nobody can say why.
- **Lettering never rotates.** Rotating a part must rotate its artwork — a
  resistor's zigzag, a diode's bar — and must *not* rotate its text. A DC
  source turned upright once drew its minus sign as a vertical bar. Use
  `UprightText`, which undoes the symbol group's linear transform about the
  text's own anchor.
- Imported artwork that draws its own leads and labels sets
  `selfDrawnPorts`, so the generic port overlay does not double them.

---

## 4. Text on the sheet

What is drawn, and what is deliberately not:

| Item | Drawn? | Why |
| --- | --- | --- |
| Reference designator (`R1`, `C3`, `D1`) | yes, above | Without it you cannot refer to a part in prose or in a measurement |
| Value (`10 kΩ`, `100 µF`) | yes, below | Engineering-formatted, with a real `µ` and `Ω` |
| Pin names on electrical terminals | **no** | `p`/`n`, `A`/`K`, `c+`/`c-` are noise; the glyph says which end is which |
| Pin names on signal ports | yes | On a signal-flow block the port name *is* the interface |

The designator/value pair brackets the symbol — name above, value below —
which is how every schematic draws a horizontally-laid two-terminal part.
`pickLabelSide` chooses the first face with no ports on it, because ports,
not aspect ratio, are what a label must avoid.

Designators are **derived when absent** (`deriveDisplayLabels`): a document
emitted by a script carries no labels, and a sheet whose parts have only
values cannot be talked about. Numbering runs in document order so it is
stable, and steps over any designator an author used by hand.

---

## 5. Open defects

Tracked in issue #1. Current as of the last render:

- **Labels anchor to the bbox, not to the ink.** A capacitor's plates occupy
  about a third of its box height, so its value sits further below the glyph
  than it should. Needs a per-symbol ink band, or tighter catalog bboxes.
- **The dot grid competes with the drawing** at render density.
- **Wires referencing a port that does not exist are dropped silently.** A
  generated document that misnames a port — `p` instead of `a` on a diode —
  loses those wires with no diagnostic anywhere. This should surface as a
  problem, not a hole in the circuit.
- **Auto-placement is out of scope here.** A badly laid-out document will
  still look bad; that is a layout concern, not a rendering one. The
  renderer's job is to draw a good document beautifully.

---

## 6. Worked example

`examples/buck_converter.gsim_sch` is the reference sheet: seven parts, ten
wires, every coordinate a multiple of the grid. It is generated from the
geometry in §1 rather than hand-typed, and it asserts its own invariants
(terminals on grid, no overlapping bodies, every wire naming a port that
exists) so it cannot rot into a counter-example.
