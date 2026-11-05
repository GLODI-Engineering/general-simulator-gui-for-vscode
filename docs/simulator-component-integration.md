# Simulator Component Integration Guide

This document explains how simulator-specific component support was added to
`general-simulator`, how the compatibility layer is structured, and what future
agents or maintainers must update when adding a new component family or a new
simulator.

It is the technical companion to `docs/simulator-component-support.md`.

## Purpose

The project now supports three solver-facing compatibility modes in the frontend:

- `ngspice`
- `xyce`
- `scipy`

The compatibility system has two jobs:

1. Define the canonical block taxonomy shared by frontend and backend.
2. Let the frontend filter the library by selected simulator without inventing
   simulator support rules in multiple places.

## Source Of Truth

These files are the core of the implementation:

- `apps/frontend/src/library/simulator-compat.yaml`
  Canonical simulator-to-block support list.
- `apps/frontend/src/library/simulator-compat.ts`
  Browser-safe inlined copy of the YAML data.
- `apps/frontend/src/library/SimulatorSelect.tsx`
  UI selector for active simulator filter.
- `apps/frontend/src/library/LibraryActivity.tsx`
  Applies the filter to visible catalog entries.
- `packages/blocks/src/blocks/**/metadata.yaml`
  One metadata file per block.
- `apps/frontend/src/library/catalog-manifest.json`
  Build-time snapshot of the catalog.
- `apps/frontend/scripts/build-catalog-manifest.ts`
  Regenerates the manifest from metadata files.
- `packages/schemas/definitions/blocks/block-metadata.schema.json`
  Shared metadata contract.
- `packages/simulator/src/simulator/compiler/spice_netlist_writer.py`
  Backend classic-SPICE mapping entry point.

## Architecture

### 1. Canonical Taxonomy

The compatibility work established dotted canonical names such as:

- `passive.resistor`
- `source.voltage.pulse`
- `source.dependent.vcvs`
- `semi.mosfet.vdmos`
- `tline.linear_device`

These names are the join key across:

- block metadata
- frontend catalog manifest
- frontend simulator filter
- backend `BLOCK_TO_SPICE` mapping
- future docs and tests

The key rule is: once a block key ships, do not rename it casually.

### 2. Metadata-Driven Catalog

Each component is defined by a `metadata.yaml` file under
`packages/blocks/src/blocks/`.

The frontend does not hardcode block definitions. Instead it:

1. loads metadata through the generated `catalog-manifest.json`
2. validates entries via `apps/frontend/src/library/catalog-core.ts`
3. displays categories and items in `LibraryActivity.tsx`
4. filters them through the active simulator support list

### 3. Compatibility Filter

The frontend compatibility filter is intentionally simple:

1. `SimulatorSelect.tsx` writes `activeSimulator` into the library store.
2. `LibraryActivity.tsx` reads that value.
3. `loadSimulatorCompat()` returns the supported block list for the selected
   simulator.
4. The visible catalog is `catalog.filter((entry) => supported.has(entry.name))`.

There is no runtime YAML parsing in the browser. The frontend uses the inlined
`simulator-compat.ts` copy, which must be kept in sync with the YAML source.

## What Had To Be Solved

The implementation was not only “add metadata files”. Several shared contract
problems had to be fixed first.

### 1. Schema Was Too Narrow

The original block-metadata schema only allowed:

- old v1 categories: `signal`, `control`, `power`, `sinks`, `subsystems`, `user`
- two-segment dotted names like `<a>.<b>`
- two-segment `equation_template`
- lowercase-only parameter names

That was incompatible with the FE-45 to FE-49 taxonomy, which requires:

- categories: `passive`, `sources`, `dependent`, `semiconductor`, `tline`
- multi-segment names like `source.voltage.pulse`
- SPICE-style parameter names like `R`, `C`, `V1`, `TD`, `Z0`, `FREQ`

Fix applied:

- widen the schema enum for `category`
- widen `name` and `behavior.equation_template` regexes to allow multi-segment
  dotted names
- widen param-name regex to allow uppercase SPICE-style names

Files changed:

- `packages/schemas/definitions/blocks/block-metadata.schema.json`
- `packages/schemas/generated/typescript/index.ts`
- `packages/schemas/generated/python/__init__.py`
- `packages/schemas/scripts/codegen.mjs`

### 2. Frontend Loader Validation Was Too Narrow

`apps/frontend/src/library/catalog-core.ts` had a hardcoded canonical-pattern
check for `equation_template` that still expected only `<a>.<b>`.

Fix applied:

- widen the runtime validation regex to the same multi-segment dotted pattern as
  the schema.

### 3. Existing Metadata Was Authored Against An Older Contract

The pre-existing scaffolded metadata for passive, source, semiconductor, and
transmission-line blocks had several mismatches:

- missing `behavior.equation_template`
- invalid causality values such as `bidirectional` and `effort_source`
- invalid electrical `dims` payloads on non-signal ports
- uppercase stable port ids in semiconductor and tline blocks
- `boolean` instead of schema-valid `bool`

Fixes applied:

- add `behavior.equation_template: <block-name>` everywhere
- normalize causality values to schema-valid values:
  - independent sources -> `source`
  - circuit elements / semiconductors / tlines -> `acausal`
- remove `dims` from electrical ports
- lowercase stable port ids while preserving rendered labels
- normalize param types such as `boolean -> bool`, count-like params to `integer`

### 4. FE-47 Was Only Partially Scaffolded

Only the voltage-source metadata files existed. The following FE-47 files had to
be added:

- current sources:
  - `source.current.dc`
  - `source.current.pulse`
  - `source.current.sin`
  - `source.current.exp`
  - `source.current.pwl`
  - `source.current.sffm`
  - `source.current.am`
- dependent sources:
  - `source.dependent.vcvs`
  - `source.dependent.vccs`
  - `source.dependent.cccs`
  - `source.dependent.ccvs`
- other sources:
  - `source.behavioral`
  - `source.ideal_delay`

### 5. Manifest Must Be Regenerated, Not Hand-Edited

`catalog-manifest.json` is generated output. It must always be rebuilt from the
 metadata source.

Command used successfully in this repo:

```bash
node --experimental-strip-types "build-catalog-manifest.ts"
```

Run it from:

```bash
apps/frontend/scripts/
```

## Final Metadata Rules

Future agents should preserve these conventions.

### Categories

- `signal`
- `control`
- `power`
- `passive`
- `sources`
- `dependent`
- `semiconductor`
- `tline`
- `sinks`
- `subsystems`
- `user`

### Naming

- `name` uses canonical dotted taxonomy.
- `behavior.equation_template` should equal `name` unless there is a strong,
  explicit reason not to.

### Port IDs

Stable ids are lowercase.

Examples:

- resistor: `p`, `n`
- VCVS: `cp`, `cn`, `p`, `n`
- diode: `a`, `k`
- BJT: `c`, `b`, `e`
- MOSFET: `d`, `g`, `s`, `b`
- tline: `a1`, `b1`, `a2`, `b2`

Rendered labels may stay uppercase or symbolic.

### Causality

Use schema-valid values only:

- `source`
- `causal`
- `acausal`
- `sink`

For the circuit-domain blocks added here:

- independent electrical sources -> `source`
- passive / semiconductor / tline devices -> `acausal`

### Parameter Names

SPICE-style uppercase names are valid and expected where they mirror backend
netlist names.

Examples:

- `R`, `C`, `L`
- `V`, `I`, `V1`, `V2`
- `TD`, `TR`, `TF`, `PW`, `PER`
- `Z0`, `FREQ`, `RPERL`, `CPERL`

Do not rename these to lowercase just to “look prettier”; they are contract keys.

## How To Add A New Component

If the component belongs to an existing simulator family:

1. Choose the canonical dotted block name.
2. Add `metadata.yaml` under `packages/blocks/src/blocks/<family>/<dir>/`.
3. Follow the current schema contract exactly.
4. Add the block key to `apps/frontend/src/library/simulator-compat.yaml` for
   every simulator that supports it.
5. Mirror the change into `apps/frontend/src/library/simulator-compat.ts`.
6. Regenerate `apps/frontend/src/library/catalog-manifest.json`.
7. If it is circuit-domain, add or update the backend mapping in
   `packages/simulator/src/simulator/compiler/spice_netlist_writer.py`.
8. Run verification.

## How To Add A New Simulator

1. Add a new simulator entry to `simulator-compat.yaml`.
2. Mirror it into `simulator-compat.ts`.
3. Ensure `SimulatorSelect.tsx` will display it correctly.
4. Decide whether `LibraryActivity.tsx` needs category-label or UX changes.
5. Ensure backend solver selection / execution exists for that simulator.
6. Document support in `docs/simulator-component-support.md`.

## Verification Checklist

Minimum verification used during this implementation:

```bash
pnpm --filter @gensim/frontend typecheck
pnpm --filter @gensim/frontend test
pnpm -F @gensim/schemas codegen:check
```

When metadata changes:

```bash
node --experimental-strip-types "build-catalog-manifest.ts"
```

from `apps/frontend/scripts/`.

## Practical Gotchas

### Keep YAML And TS Compatibility Data In Sync

`simulator-compat.yaml` is the canonical human-edited file, but the frontend uses
`simulator-compat.ts` at runtime. If they drift, tests or UI behavior will drift.

### Do Not Hand-Edit The Manifest

Always regenerate from metadata. Manual edits are fragile and will drift from the
catalog loader.

### Backend And Frontend Must Share Names Exactly

The frontend library, compatibility filter, and backend SPICE mapping all join on
the same block keys and many of the same param names / port ids.

If you change one side without the other, you create a silent contract bug.

### Compatibility Catalog Is Broader Than Current Backend Mapping

The compatibility catalog is the user-facing support declaration.
`BLOCK_TO_SPICE` may still be expanded incrementally on the backend side. When
implementing new circuit blocks, treat frontend compatibility and backend mapping
as one contract and update both in the same change when possible.

## Related Files

- `docs/simulator-component-support.md`
- `apps/frontend/src/library/simulator-compat.yaml`
- `apps/frontend/src/library/simulator-compat.ts`
- `apps/frontend/src/library/LibraryActivity.tsx`
- `apps/frontend/src/library/SimulatorSelect.tsx`
- `apps/frontend/scripts/build-catalog-manifest.ts`
- `apps/frontend/src/library/catalog-manifest.json`
- `packages/schemas/definitions/blocks/block-metadata.schema.json`
- `packages/simulator/src/simulator/compiler/spice_netlist_writer.py`
