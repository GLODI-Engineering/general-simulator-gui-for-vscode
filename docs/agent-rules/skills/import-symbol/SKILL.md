---
name: import-symbol
description: Import a user-drawn draw.io SVG component symbol into the frontend — extract geometry, compute coordinate transform, update metadata YAML + catalog-manifest, write JSX render, register in SCHEMATIC_SYMBOLS, test, commit.
---

# `/import-symbol` — Import a draw.io SVG symbol into the frontend

Invoke whenever the user drops one or more `.drawio.svg` files into
`Misc/component-drawing-specs/My-drawings/` and asks you to "import"
them. The process has nine deterministic steps. Do not skip any.

---

## Convention the user follows when drawing

- The drawing canvas in draw.io has **no fixed size** — the user draws at
  whatever scale feels comfortable.
- **Red lines (`#FF2A00` stroke)** are **port stubs** — short segments
  that extend from the component body to the external pin connection
  point. The OUTER tip of each red stub is the pin's wire-connection
  point. The INNER end (where red meets black) is the component boundary.
- **Black lines** are the component body.
- **Labels** (D, G, S, B, C, E …) are placed near each red stub to name
  the port.

---

## Step 1 — Scan the drawing file(s)

Run the extraction script below for every new SVG file. It prints all SVG
elements, their color, and the bounding box.

```python
import xml.etree.ElementTree as ET, re

def parse_d(d):
    return [(float(p.split()[0]), float(p.split()[1]))
            for p in re.findall(r'[-\d.]+\s+[-\d.]+', d)]

fname = "Misc/component-drawing-specs/My-drawings/<file>.drawio.svg"
tree = ET.parse(fname)
root = tree.getroot()
print(f"SVG: {root.get('width')} x {root.get('height')}")

all_pts = []
for p in root.iter('{http://www.w3.org/2000/svg}path'):
    d = p.get('d','')
    style = p.get('style','') or ''; stroke = p.get('stroke','') or ''
    sw = p.get('stroke-width','?')
    is_red = 'ff2a00' in stroke.lower() or 'ff2a00' in style.lower() \
             or 'rgb(255, 42, 0)' in style
    color = 'RED' if is_red else 'black'
    pts = parse_d(d)
    if pts:
        print(f'  [{color} sw={sw}] {pts[0]} → {pts[-1]}  d="{d[:70]}"')
        all_pts.extend(pts)

for e in root.iter('{http://www.w3.org/2000/svg}ellipse'):
    cx,cy = float(e.get('cx',0)), float(e.get('cy',0))
    rx,ry = float(e.get('rx',0)), float(e.get('ry',0))
    print(f'  [ellipse] cx={cx} cy={cy} rx={rx} ry={ry}')
    all_pts += [(cx-rx,cy),(cx+rx,cy),(cx,cy-ry),(cx,cy+ry)]

xs=[p[0] for p in all_pts]; ys=[p[1] for p in all_pts]
print(f'bbox: x={min(xs):.0f}→{max(xs):.0f}  y={min(ys):.0f}→{max(ys):.0f}')

print('\nPORT STUBS (RED):')
for p in root.iter('{http://www.w3.org/2000/svg}path'):
    style=p.get('style','') or ''; stroke=p.get('stroke','') or ''
    if 'ff2a00' in stroke.lower() or 'ff2a00' in style.lower() \
       or 'rgb(255, 42, 0)' in style:
        pts=parse_d(p.get('d',''))
        if pts: print(f'  outer={pts[0]}  inner={pts[-1]}')
```

**From the output, record:**

| Variable | Value |
|---|---|
| `x0, x1` | x range of **black** elements only (strip red stubs and labels) |
| `y0, y1` | y range of **black** elements only |
| `bw = x1 - x0` | body width in draw.io units |
| `bh = y1 - y0` | body height in draw.io units |
| For each port: `(px, py)` | INNER end of the red stub (body boundary) |
| For each port: exit direction | Which face the red stub exits from |

---

## Step 2 — Choose the target bbox

Pick `W × H` (unscaled SVG pixels) so that:

1. `W / H ≈ bw / bh` (preserve aspect ratio).
2. Both values are round multiples of 2 (avoids half-pixel rendering).
3. The symbol is comparable in visual size to the existing components
   (most transistors are 80×80 or 80×110; passives are 60×40;
   dependent sources 80×60 or 120×44).

---

## Step 3 — Compute the coordinate transform

```
svg_x(X) = round((X - x0) / bw * W, 1)
svg_y(Y) = round((Y - y0) / bh * H, 1)
```

This maps draw.io body coordinates to the `[0,W] × [0,H]` SVG bbox space.
Run a second Python snippet that applies this transform to every element
and prints the results. Round each coordinate to the nearest integer for
clean JSX.

---

## Step 4 — Determine port positions

For each port stub (inner endpoint = body boundary contact point):

| Port exits via … | `side` | `offset` value |
|---|---|---|
| Left face (stub goes left) | `left` | `svg_y(py)` |
| Right face (stub goes right) | `right` | `svg_y(py)` |
| Top face (stub goes up) | `top` | `svg_x(px)` |
| Bottom face (stub goes down) | `bottom` | `svg_x(px)` |

Round offset to the nearest integer.

---

## Step 5 — Update metadata YAML(s)

Find all `metadata.yaml` files for the affected component:

```bash
find packages/blocks/src/blocks -name metadata.yaml \
  | xargs grep -l "<component-name>"
```

In each file, update:

```yaml
symbol:
  bbox: [W, H]        # new values
  shape: rect         # unchanged
  text: <LABEL>

ports:
  inputs:
    - id: <port-id>
      side: <side>
      offset: <offset>
      ...
  outputs:
    - id: <port-id>
      side: <side>
      offset: <offset>
      ...
```

---

## Step 6 — Update catalog-manifest.json

The manifest at `apps/frontend/src/library/catalog-manifest.json` caches
the metadata. Update it with a Python script — never edit it by hand:

```python
import json, copy

MANIFEST = "apps/frontend/src/library/catalog-manifest.json"
with open(MANIFEST) as f:
    data = json.load(f)

NEW_BBOX  = [W, H]
NEW_PORTS = { ... }   # same structure as the YAML ports section

for entry in data:
    if entry["metadata"].get("name") in TARGET_NAMES:
        entry["metadata"]["symbol"]["bbox"] = NEW_BBOX
        entry["metadata"]["ports"] = copy.deepcopy(NEW_PORTS)

with open(MANIFEST, "w") as f:
    json.dump(data, f, indent=2)
```

`TARGET_NAMES` is the list of `name` values from all the metadata YAMLs
you updated in Step 5.

---

## Step 7 — Write the JSX render function

Open `apps/frontend/src/canvas/nodes/component-symbols.tsx`.

Each SVG element from the draw.io file maps to one JSX element:

| draw.io element | JSX | Notes |
|---|---|---|
| `M x1 y1 L x2 y2` (line) | `<line x1={} y1={} x2={} y2={} stroke={STROKE} strokeWidth={SW} />` | |
| `M … L … L … Z` (closed path / polygon) | `<polygon points="x1,y1 x2,y2 …" fill={STROKE} stroke="none" />` | For filled arrows |
| `M … L … L … Z` (open / unfilled polygon) | `<polyline points="…" fill="none" stroke={STROKE} strokeWidth={SW} />` | |
| Ellipse | `<circle cx={} cy={} r={} fill="none" stroke={STROKE} strokeWidth={SW*0.8} />` | Use `<ellipse>` if rx≠ry by more than 2 |
| Horizontal/vertical bars connecting many segments | `<polyline points="x1,y1 x2,y2 …" fill="none" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />` | |

**Constants already defined at the top of the file:**

```tsx
const STROKE = "#0f172a";   // near-black
const FILL   = "#ffffff";   // white (for filled shapes with white interior)
const SW     = 2.1;         // default stroke width (pre-scale)
```

After `SYMBOL_SCALE = 1.6` is applied at render time, `SW` becomes
`≈ 3.36 px` on screen — matching the wire stroke width.

**Structure the function as:**

```tsx
// ── <ComponentName> (user-drawn, bbox W×H) ─────────────────────────────────
// Geometry from: <filename>.drawio.svg
// <Port layout summary>
function <componentName>Render(): ReactNode {
  return (
    <g>
      {/* <element description> */}
      <line … />
      {/* … */}
    </g>
  );
}
```

If N and P variants share the same structure with one visual difference
(arrow direction, etc.), write a single `<name>Symbol(kind)` helper and
two thin wrapper functions.

---

## Step 8 — Register in SCHEMATIC_SYMBOLS

In `component-symbols.tsx`, add an entry to the `SCHEMATIC_SYMBOLS`
registry for every block `name` that should use this render:

```tsx
"<block.name>": {
  staticLabel: "<LABEL>",
  render: () => <componentName>Render(),
},
```

The key must exactly match the `name` field in `metadata.yaml`.

If the same visual applies to multiple names (e.g. `semi.bjt.npn` AND
`physical_electrical.semiconductor.bjt_npn`), add one entry per name.

---

## Step 9 — Verify and commit

```bash
# Type-check
cd apps/frontend && npx tsc --noEmit

# Unit tests (canvas nodes + BlockSymbol)
npx vitest run src/canvas/nodes/

# Full frontend suite
npx vitest run
```

All must pass. Then commit using `/commit` (or directly):

```
feat(canvas): import user-drawn <ComponentName> symbol
```

Commit message body should list:
- Source file(s)
- New bbox
- Port layout (side/offset for each port)
- Which block names were updated

---

## Quick-reference: file checklist

| File | What changes |
|---|---|
| `packages/blocks/src/blocks/<path>/metadata.yaml` | `symbol.bbox`, `ports[*].side`, `ports[*].offset` |
| `apps/frontend/src/library/catalog-manifest.json` | Same fields (regenerated by script) |
| `apps/frontend/src/canvas/nodes/component-symbols.tsx` | New render function + `SCHEMATIC_SYMBOLS` entry |

No other files need to change for a symbol-only import.

---

## Common pitfalls

| Problem | Cause | Fix |
|---|---|---|
| Port dot appears inside the body | `offset` is 0 or negative | Check that `svg_y(inner_y)` is non-negative |
| Wire snaps to wrong corner | Port on wrong `side` | Verify which face the red stub exits from |
| Symbol invisible (shows rect fallback) | `SCHEMATIC_SYMBOLS` key doesn't match `name` | Check for `_` vs `-` in the key; use `getSchematicSymbol()` normalization rules |
| Circle distorted | rx ≠ ry after transform | The body bounds have different x and y scales; use `<ellipse rx={} ry={}>` instead of `<circle>` |
| HMR crash "Duplicate … id" | Registry Map not cleared on hot reload | `bootRegistries()` in `App.tsx` must call `resetActivityRegistry()` and `resetBottomTabRegistry()` before registering — already fixed, don't revert |
