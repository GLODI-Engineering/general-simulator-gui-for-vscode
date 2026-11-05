# How to draw a component and import it into the simulator

This document explains, step by step, how you design a component symbol in
draw.io and how the software converts it into a live schematic symbol.

---

## The big picture

The frontend renders every component as an inline SVG built from a small
render function. That function contains hardcoded coordinates that were
translated from your draw.io drawing. The ports (G, D, S, B, C, E …) are
separate from the drawing — they are defined by `side` and `offset` numbers
in a YAML file. The pipeline is:

```
Your draw.io file
      ↓  (Python extraction script)
Raw coordinates in draw.io space
      ↓  (coordinate transform formula)
Normalized coordinates in bbox space
      ↓  (manual translation to JSX)
Render function in component-symbols.tsx
      +
Port offsets in metadata.yaml
      ↓
Working symbol in the frontend
```

---

## Step 1 — Draw your component in draw.io

Open draw.io (desktop app or draw.io at diagrams.net).

### Rules to follow while drawing

**1. Use any canvas size.** There is no fixed page size. Draw at whatever
scale feels comfortable — the import process normalises everything.

**2. Draw the body in black.** Use the default black stroke for all
component lines, shapes and circles.

**3. Mark ports with red stubs.** For every terminal that will connect to a
wire, draw a short line in **red (`#FF2A00`)** extending outward from the
body. This red line is the "port stub". The outer tip is where the wire will
connect; the inner tip (where red meets black) is the component boundary.

Example for an N-MOSFET:
- Gate exits LEFT → draw a short red horizontal line going left from the
  gate lead
- Drain exits TOP → draw a short red vertical line going up from the drain
  connection
- Source exits BOTTOM → same going down

**4. Label each stub (optional but recommended).** Add a text element near
each red stub (D, G, S, B, etc.) so it's clear which terminal is which.

**5. Save as SVG.** File → Export As → SVG. Save into
`Misc/component-drawing-specs/My-drawings/`.

---

## Step 2 — What the import script does

Once you drop the file into the `My-drawings/` folder and ask for an import,
an agent runs a Python script that reads every SVG element and classifies
it:

- **Black elements** → the component body (lines, circles, polygons)
- **Red elements** → port stubs (their positions define the port offsets)

The script computes:

1. The **body bounding box** — the smallest rectangle that contains all
   black elements.
2. The **port positions** — the inner endpoints of the red stubs (where
   each stub touches the body).

---

## Step 3 — The coordinate transform

The draw.io canvas can be at any scale. The simulator uses a fixed **bbox**
(e.g. 80×80 px, 80×110 px, 120×44 px) for every component. Everything is
scaled to fit.

The transform formula:

```
svg_x = (drawio_x  −  body_left)  ÷  body_width  ×  bbox_W
svg_y = (drawio_y  −  body_top)   ÷  body_height  ×  bbox_H
```

After this transform, the body always fills `[0,W] × [0,H]`.

**Example** — your N-MOS body spans `x: 140→420, y: 110→490` in draw.io
(body_width=280, body_height=380). Chosen bbox = 80×110.

```
svg_x(320) = (320−140)/280 × 80 = 51
svg_y(390) = (390−110)/380 × 110 = 81
```

---

## Step 4 — Port positions

Each port is defined by two numbers in `metadata.yaml`:

- **`side`**: which face of the bbox the port exits from
  (`left`, `right`, `top`, `bottom`)
- **`offset`**: distance along that face from the top-left corner

| Port exits via … | `side` | `offset` |
|---|---|---|
| Left face (red stub goes left) | `left` | `svg_y(inner_y)` |
| Right face (red stub goes right) | `right` | `svg_y(inner_y)` |
| Top face (red stub goes up) | `top` | `svg_x(inner_x)` |
| Bottom face (red stub goes down) | `bottom` | `svg_x(inner_x)` |

Where `inner_x` / `inner_y` is the coordinates of the **inner end of the
red stub** (the point touching the black body).

---

## Step 5 — Files that are updated

Three files change for every import:

### `packages/blocks/src/blocks/…/metadata.yaml`

This is the block's definition file. The `symbol` section is updated:

```yaml
symbol:
  bbox: [80, 110]   ← new W × H
  shape: rect

ports:
  inputs:
    - id: g
      side: left
      offset: 81    ← svg_y of the gate's inner red stub endpoint
  outputs:
    - id: d
      side: top
      offset: 51    ← svg_x of the drain's inner red stub endpoint
    - id: s
      side: bottom
      offset: 51
```

### `apps/frontend/src/library/catalog-manifest.json`

This is a cached copy of all metadata, used by the frontend library panel.
It is updated automatically by a Python script — never edited by hand.

### `apps/frontend/src/canvas/nodes/component-symbols.tsx`

This TypeScript file contains one render function per component. The render
function returns JSX (React's inline SVG syntax). Each draw.io element
becomes one JSX element:

| draw.io shape | JSX element |
|---|---|
| A line `M x1 y1 L x2 y2` | `<line x1={} y1={} x2={} y2={} stroke={STROKE} strokeWidth={SW} />` |
| A filled polygon / arrowhead | `<polygon points="x1,y1 …" fill={STROKE} stroke="none" />` |
| An unfilled polygon | `<polyline points="…" fill="none" stroke={STROKE} strokeWidth={SW} />` |
| An ellipse / circle | `<circle cx={} cy={} r={} fill="none" stroke={STROKE} strokeWidth={SW*0.8} />` |

The component also needs an entry in the `SCHEMATIC_SYMBOLS` registry
(further down in the same file) that maps the block's name to the render
function.

---

## Step 6 — How it looks on screen

After the import:

1. The **symbol body** is drawn by the render function, scaled by
   `SYMBOL_SCALE = 1.6`. So a bbox of 80×110 appears as 128×176 px on
   screen at zoom 1.

2. Each **port** gets a short stub line and a filled dot, rendered by
   `Port.tsx`. The stub extends 16 px outward from the body boundary
   (the `offset` position on the given face), and the dot sits at the
   outer tip. This is where you click to start drawing a wire.

3. **Labels** (the component reference designator and value) are drawn
   by `BlockSymbol.tsx` above or beside the symbol automatically.

---

## Practical tips for drawing

| Do | Don't |
|---|---|
| Use a single continuous channel bar for JFETs and MESFETs | Use three separate segments (that's the MOSFET's enhancement-gap style) |
| Place port stubs so they exit from flat edges of the body | Have a port stub exit diagonally — the port system only supports 4 cardinal directions |
| Draw the circle body LARGE so it visually dominates | Make it so small that body lines overlap confusingly |
| Keep port stubs clearly longer than any body line | Make a stub so short it's ambiguous which is body and which is stub |
| Draw BOTH N and P variants even if they look the same | Rely on the code to "mirror" a symbol — draw the intended version |

---

## Example: the N-MOSFET import

Your file `spice-primitive.N-MOS.svg` had:

- SVG canvas: 488 × 600 px
- Black body bounds: `x = 140→420, y = 110→490` (280×380 px)
- Port stubs (inner ends):
  - G at `(140, 390)` — exits LEFT
  - D at `(320, 110)` — exits TOP
  - S at `(320, 490)` — exits BOTTOM

Chosen bbox: **80×110** (ratio 0.73 ≈ 280/380).

Transform formula:
```
svg_x(X) = (X−140)/280 × 80
svg_y(Y) = (Y−110)/380 × 110
```

Port offsets:
```
G → side=left,   offset = svg_y(390) = 81
D → side=top,    offset = svg_x(320) = 51
S → side=bottom, offset = svg_x(320) = 51
```

The channel bar at draw.io x=230 → `svg_x(230) = 26`, and so on for every
other element. Each translated coordinate became a number in the JSX render
function.

---

## Where to find things

| What | Where |
|---|---|
| Your draw.io source files | `Misc/component-drawing-specs/My-drawings/` |
| Block metadata (ports, bbox) | `packages/blocks/src/blocks/<category>/<name>/metadata.yaml` |
| Frontend symbol library catalog | `apps/frontend/src/library/catalog-manifest.json` |
| All render functions | `apps/frontend/src/canvas/nodes/component-symbols.tsx` |
| Port stub visual code | `apps/frontend/src/canvas/nodes/Port.tsx` |
| Agent skill (step-by-step for agents) | `docs/agent-rules/skills/import-symbol/SKILL.md` |
