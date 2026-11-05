# GSF — Gsim Symbol Format (v1)

> **Status:** specification + v1 implementation target.
> **Epics:** BE-71..BE-74 (`progress.backend.yaml`), FE-170..FE-171
> (`progress.frontend.yaml`).
> **Depends on:** FE-103 (catalog-driven primitive renderer) — GSF's primitive
> vocabulary is defined as *exactly* the `Primitive` union in
> `apps/frontend/src/canvas/nodes/primitive-renderer.ts`, not a new one.
> **Supersedes nothing:** `docs/specs/symbol-editor-spec.md` (FE-104) still
> governs the future in-canvas drawing UI; this document is the data format
> and the programmatic (Python) authoring API that UI will eventually target.
> Building that UI is explicitly out of scope here — see §5.

## 1. Why a new format, and why it isn't a new runtime store

`symbol-editor-spec.md` §4 already forbids a parallel persistence store for
catalog symbols: the catalog's source of truth stays `metadata.yaml` under
`packages/blocks/src/blocks/**`, machine-compiled into
`apps/frontend/src/library/catalog-manifest.json`. GSF does not change that.

GSF is two things, both additive:

1. **A schema extension**: `symbol.shape: primitives` — a new alternative to
   the existing `rect | circle | triangle | custom` enum
   (`packages/schemas/definitions/blocks/block-metadata.schema.json:164`).
   When set, `symbol.primitives` holds a literal array of `Primitive` union
   values (§2) instead of relying on the built-in single-shape renderer. This
   is what lets a real multi-primitive drawing (a BJT, a MOSFET) live in
   `metadata.yaml` and be read by `metadataToPrimitives()`, instead of
   requiring a hand-written entry in `component-symbols.tsx`'s
   `SCHEMATIC_SYMBOLS` table.
2. **A portable single-component file, `.gsim_sym`**: the JSON serialization
   of one component definition (superset of a `metadata.yaml` entry: adds a
   top-level `name`/`type` wrapper so the file is self-describing without its
   catalog directory path). It exists for *authoring and exchange* — build a
   component in a scratch file, validate it, preview it, share it — before it
   is merged into the catalog tree as a real `metadata.yaml`. It is never read
   directly by the compiler or the frontend; `gsim_model.gsim_sym.merge_into_catalog()`
   is the only bridge from a `.gsim_sym` file into the catalog.

## 2. Primitive vocabulary (frozen, matches FE-103 exactly)

```
line · rect · rectf · circle · arc · polygon · polyline · text
```

Field-for-field identical to the TypeScript union at
`primitive-renderer.ts:14-60`. No new primitive kinds. Coordinates are
integers in block-local space, origin at the top-left of `symbol.bbox` — same
frame `metadataToPrimitives` already uses (`primitive-renderer.ts:217-219`).

## 3. Transforms are an authoring-time convenience, not a schema field

The rendered/stored `Primitive` values stay in absolute coordinates — the
runtime schema and `renderPrimitives()` do not change shape. Transforms
(`translate`, `rotate`, `scale`, `mirror`) live only in the Python authoring
API (`gsim_model.symbol`, §4): each transform method takes a primitive and
returns a **new primitive with the transform already baked into its
coordinates**. This keeps the frontend renderer untouched (zero new render
logic — `renderPrimitives()` already handles the full union) and keeps GSF
files simple, portable data with no transform-evaluation step required of
whoever reads them.

## 4. Python component-creator API (`gsim_model.symbol`)

- Primitive builder functions/dataclasses for all eight kinds.
- Transform methods, composable by chaining, each returning a new resolved
  primitive: `.translate(dx, dy)`, `.rotate(degrees, center=None)`,
  `.scale(sx, sy=None, center=None)`, `.mirror(axis)`.
- `SymbolBuilder`: accumulates primitives + a bbox, exposes `.port(id, side,
  offset, kind, direction)` for port placement (reusing the existing
  `side`/`offset` convention from `gsim_model.layout.PortGeometry` — no new
  port-positioning scheme), and `.build()` producing a GSF-shaped `symbol` +
  `ports` fragment.
- `ComponentDefinition`: the full authoring object — `name`, `label`,
  `version`, `category`, `description`, `paradigm` (one of the existing
  paradigm enum values: physical-network | signal-flow | converter |
  hierarchy | routing | annotation | spice-subckt — exactly one, required),
  `domain`, `aliases`, `tags`, `params`, `fidelities`, `symbol`
  (`SymbolBuilder.build()` output), `ports`, `behavior`. Raises `ValueError`
  if `paradigm` is missing or not from the enum — "every component is of
  exactly one type" is enforced here, not left to convention.

## 5. Explicit non-goals

- No drag-and-drop / canvas drawing UI. That is FE-104's scope, deferred.
- No change to `renderPrimitives()`, `symbolTransform()`, or port hit-testing
  math — GSF reuses all of it unmodified.
- No migration of existing hardcoded `SCHEMATIC_SYMBOLS` entries. BE-74/FE-171
  prove parity for two components (BJT, MOSFET) as a validation exercise;
  retiring the hardcoded table block-by-block is a separate future epic.
