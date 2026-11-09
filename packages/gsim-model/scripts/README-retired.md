# Retired scripts

A file here named `*.retired` is kept for its reasoning, not for running. It is
renamed rather than deleted so the history stays attached to it, and renamed
rather than left runnable because running it would undo a deliberate decision.

## `author_bjt_mosfet_symbols.py.retired`

Generated `bjt_npn`/`bjt_pnp`/`mosfet_n`/`mosfet_p` metadata with inline
`shape: primitives` artwork on an 80x110 box, pins at offsets 41/46/81/51.

Both of those are now wrong, by two deliberate commits:

* **`835e34c`** took artwork out of metadata altogether. A drawing is one file
  under `apps/frontend/src/canvas/nodes/symbols/`, named in
  `symbols/registry.ts`; metadata carries `shape: rect` and no drawing. Two
  descriptions of one drawing is how they drift apart, so the metadata copy was
  removed rather than rescaled.
* **`2135b2a`** resized the transistors to 60x60 with pins at their edge
  midpoints (30), so they stand the same height as the two-terminal parts beside
  them — a resistor is 60x40 with pins at 20 — instead of towering over them at
  three times a resistor's height with pins no orthogonal wire could reach.

Running the script today re-injects 105 lines of inline primitives sized for a
box that no longer exists and moves every transistor pin back off-centre. It was
verified doing exactly that before being retired: its output differs from the
shipped metadata in precisely those two ways and nothing else.

Nothing replaced it, because nothing needs to. Artwork is authored directly as
one `.tsx` file per component, which is the seam `835e34c` exists to create.

The tests that pinned its output now assert the invariants instead — see
`packages/gsim-model/tests/test_bjt_mosfet_symbol_authoring.py` for the metadata
side and `apps/frontend/src/canvas/nodes/bjt-mosfet-symbol-parity.test.ts` for
the artwork side.
