# Drawing Component Symbols by Hand

This guide explains exactly how to produce a good-looking schematic symbol for
any electrical component in general-simulator, using a vector editor like
**Inkscape** (free, recommended) or Illustrator.

---

## How the system renders symbols

Each component has two independent parts:

| Part | Where it lives | What it controls |
|---|---|---|
| **Visual drawing** | `component-symbols.tsx` — a JSX render function | How the symbol looks on screen |
| **Port positions** | `metadata.yaml` — `side` + `offset` fields | Where wires attach |

The SVG coordinate system uses **pixel units, Y-axis downward** (standard SVG).
Before rendering, every symbol is scaled by `SYMBOL_SCALE = 1.6`, so you author
in a small canvas and everything is enlarged uniformly.

Port positions are computed by `getPortCenter()` in `port-hit-test.ts`:

```
port at side: left,  offset: 20  →  SVG point (0, 20)   in unscaled space
port at side: right, offset: 10  →  SVG point (w, 10)   (w = bbox width)
port at side: top,   offset: 30  →  SVG point (30, 0)
port at side: bottom,offset: 15  →  SVG point (15, h)
```

After `SYMBOL_SCALE` the on-canvas pixel coordinate is `value × 1.6`.

---

## Step 1 — Set up Inkscape

1. **File → Document Properties** → set page to exactly `W × H` px where
   `W` and `H` match the `symbol.bbox` in the component's `metadata.yaml`.
   - Most transistors: **60 × 60 px**
   - Physical-electrical BJT/MOSFET/IGBT: **70 × 40 px**
   - Passives (R, L, C): **60 × 40 px**
2. Set **View → Zoom → Page** so you can see the whole canvas clearly.
3. Enable **View → Show/Hide → Grid** (px grid, 1 px spacing) so you can
   snap to exact integer coordinates — all port offsets are integers.
4. Set the ruler to **px** (not mm).

---

## Step 2 — Mark port positions first

Before drawing anything, place a small colored circle at every port location.
These are your anchors — everything else is drawn around them.

For example, for an NPN BJT (bbox 60×60, ports from `metadata.yaml`):

```
b  →  side: left,  offset: 20  →  circle at x=0,  y=20
c  →  side: right, offset: 10  →  circle at x=60, y=10
e  →  side: right, offset: 30  →  circle at x=60, y=30
```

**Do this in a separate layer named `ports`** (Layer panel → +).  
Give each circle a distinct color and label it with the port ID.  
Lock the `ports` layer before drawing (`Layer → Lock`).

> **Why first?** Port positions constrain the whole drawing.  
> The symbol body must connect organically to these anchors.

---

## Step 3 — Draw the symbol body

Draw on a second layer named `body`.

### What to draw for each component type

#### BJT (NPN example, 60×60, b=(0,20) c=(60,10) e=(60,30))

| Element | Inkscape tool | Coordinates |
|---|---|---|
| Base lead | Line | (0,20) → (22,20) |
| Base bar | Line, stroke-width 3 | x=22, y=13 to y=27 |
| Circle body | Circle | cx=34, cy=20, r=13 |
| Collector leg | Line | (22,14) → (60,10) |
| Emitter leg | Line | (22,26) → (60,30) |
| Emitter arrow (NPN) | Polygon (3 pts) | tip near (52,29), wings near (48,32) and (48,26) |

For PNP: same body, arrow reversed — tip near (30,27), wings near (34,30)
and (34,24).

#### MOSFET (NMOS, 60×60, g=(0,15) b=(0,35) d=(60,10) s=(60,30))

| Element | Tool | Notes |
|---|---|---|
| Gate lead | Line | (0,15) → (20,15) |
| Gate insulator bar | Line, stroke 2.5 | x=20, y=9 to y=31 |
| Drain channel seg | Line, stroke 2 | x=23, y=9 to y=16 |
| Center channel seg | Line, stroke 2 | x=23, y=20 to y=22 (tiny) |
| Source channel seg | Line, stroke 2 | x=23, y=25 to y=31 |
| D path | Polyline | 60,10 → 50,10 → 50,13 → 23,13 |
| S path | Polyline | 60,30 → 50,30 → 50,27 → 23,27 |
| Body tie | Polyline | 50,27 → 50,20 → 27,20 |
| Bulk lead | Polyline | 0,35 → 50,35 → 50,30 |
| NMOS arrow | Filled polygon | tip=(23,20), wings=(27,17.5),(27,22.5) |
| Contact dots | Small filled circles r=1.5 | at (23,13) and (23,27) |
| Circle body | Circle, no fill | cx=38, cy=20, r=13 |

#### JFET (NJFET, 60×60, g=(0,20) d=(60,10) s=(60,30))

| Element | Notes |
|---|---|
| Gate lead | (0,20) → (18,20) |
| Gate arrow | Filled triangle: tip=(23,20), wings=(18,17.5),(18,22.5) |
| Channel bar (continuous) | x=23, y=9 to y=31, stroke 2.5 — **no gaps** |
| D path | 23,13 → 50,13 → 50,10 → 60,10 |
| S path | 23,27 → 50,27 → 50,30 → 60,30 |
| Circle body | cx=38, cy=20, r=13 |

---

## Step 4 — Read the exact coordinates

Once you are happy with the drawing, you need the exact SVG coordinates of
every element to code them up.

### Reading coordinates in Inkscape

1. Select a line → open **Object → Object Properties** or the **XML editor**
   (`Ctrl+Shift+X`) to read the exact `x1 y1 x2 y2` attributes.
2. For a polyline: XML editor shows the `points` attribute directly.
3. For a circle: XML editor shows `cx`, `cy`, `r`.
4. For a polygon: XML editor shows `points`.

**Tip:** Set `Preferences → Input/Output → SVG output → Numeric precision` to
**1** decimal place — this keeps coordinates clean integers or half-integers.

### Arrow tip placement on a diagonal line

For arrows on slanted legs (like the BJT emitter arrow), use the **Node editor**
tool (`N`) to click each node and read its X/Y in the toolbar at the top.

The arrow should be:
- **Tip** at ~80 % along the emitter line (toward the pin)
- **Wings** at ~70 % along the line, offset ±2–3 px perpendicular to the line

For a line from `(x1,y1)` to `(x2,y2)`, point at fraction `t` is:
```
px = x1 + t*(x2-x1)
py = y1 + t*(y2-y1)
```
The perpendicular unit vector is `(-dy, dx) / length`.

---

## Step 5 — Export to code

### Option A — Single compound path (simple symbols)

1. Select all body elements → **Path → Object to Path** → **Path → Combine**
2. XML editor → copy the `d="…"` attribute
3. In `metadata.yaml`:
   ```yaml
   symbol:
     bbox: [60, 40]
     shape: custom
     path: "M 0 20 L 60 20 …"
   ```
This renders as a single `<path>` with white fill and dark stroke.
**Limitation:** one stroke color, one fill — good for passives, not for
transistors with mixed styles.

### Option B — Full JSX (transistors, complex symbols) ✅ recommended

Translate each Inkscape element to JSX in
`apps/frontend/src/canvas/nodes/component-symbols.tsx`:

```tsx
// Inkscape line: x1=0 y1=20 x2=22 y2=20
<line x1={0} y1={20} x2={22} y2={20} stroke={STROKE} strokeWidth={SW} />

// Inkscape polyline: points="60,10 50,10 50,13 23,13"
<polyline
  points="60,10 50,10 50,13 23,13"
  fill="none" stroke={STROKE} strokeWidth={SW}
  strokeLinecap="round" strokeLinejoin="round"
/>

// Inkscape circle: cx=34 cy=20 r=13, no fill
<circle cx={34} cy={20} r={13} fill="none" stroke={STROKE} strokeWidth={SW * 0.8} />

// Inkscape polygon (filled triangle): points="52,29 48,32 48,26"
<polygon points="52,29 48,32 48,26" fill={STROKE} stroke="none" />
```

Constants already defined at the top of the file:
```tsx
const STROKE = "#0f172a";   // near-black
const FILL   = "#ffffff";   // white
const SW     = 2.1;         // default stroke width (pre-scale)
```

Then add or replace the entry in `SCHEMATIC_SYMBOLS`:
```tsx
"semi.bjt.npn": {
  staticLabel: "NPN",
  render: () => myNewNpnRender(),
},
```

---

## Step 6 — Match port positions to metadata

After coding the symbol, open `metadata.yaml` for the component and verify the
`side` + `offset` values match where the leads actually exit the drawing.

For the NPN BJT example:
```yaml
ports:
  inputs:
    - id: b
      side: left
      offset: 20    # must match y=20 where base lead starts
  outputs:
    - id: c
      side: right
      offset: 10    # must match y=10 where collector exits
    - id: e
      side: right
      offset: 30    # must match y=30 where emitter exits
```

If you move a port stub in Inkscape, update the `offset` value to match.

---

## Reference: existing bboxes and port positions

| Component | bbox | Ports (side / offset) |
|---|---|---|
| `semi.bjt.npn` | 60×60 | b left/20, c right/10, e right/30 |
| `semi.bjt.pnp` | 60×60 | b left/20, c right/10, e right/30 |
| `semi.mosfet.n` | 60×60 | g left/15, b left/35, d right/10, s right/30 |
| `semi.mosfet.p` | 60×60 | g left/15, b left/35, d right/10, s right/30 |
| `semi.mosfet.vdmos` | 60×60 | g left/20, d right/10, s right/30 |
| `semi.jfet.n` | 60×60 | g left/20, d right/10, s right/30 |
| `semi.jfet.p` | 60×60 | g left/20, d right/10, s right/30 |
| `semi.mesfet.n` | 60×60 | g left/20, d right/10, s right/30 |
| `physical_electrical.semiconductor.bjt_npn` | 70×40 | b left/20, c right/12, e right/28 |
| `physical_electrical.semiconductor.bjt_pnp` | 70×40 | b left/20, c right/12, e right/28 |
| `physical_electrical.semiconductor.mosfet_n` | 70×40 | g left/20, d right/12, s right/28 |
| `physical_electrical.semiconductor.mosfet_p` | 70×40 | g left/20, d right/12, s right/28 |
| `physical_electrical.semiconductor.igbt_n` | 70×40 | g left/20, c right/12, e right/28 |
| `passive.resistor` | 60×40 | p left/20, n right/20 |
| `passive.capacitor` | 60×40 | p left/20, n right/20 |
| `passive.inductor` | 60×40 | p left/20, n right/20 |

---

## Recommended Inkscape workflow (summary)

```
1. New document, set page to bbox size (e.g. 60×60 px)
2. Layer "ports"  → place one colored circle per port at (side, offset) coords
3. Lock "ports" layer
4. Layer "body"   → draw the symbol around the port anchors
5. Iterate until it looks right
6. Select each element → XML editor → note the exact coordinates
7. Translate coordinates to JSX in component-symbols.tsx
8. Add/replace entry in SCHEMATIC_SYMBOLS
9. Verify port offsets in metadata.yaml match drawing exits
10. Run: cd apps/frontend && npx vitest run src/canvas/nodes/
```

Keep the Inkscape `.svg` file in `Misc/component-drawing-specs/inkscape/`
alongside the KiCad reference data for future reference.
