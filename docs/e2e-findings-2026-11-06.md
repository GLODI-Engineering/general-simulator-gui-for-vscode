# What driving the schematic by mouse turned up

A record of the defects found by building the end-to-end suite, so the ones
not fixed here are not lost. Each says what it was, how it showed up, and
whether it is fixed.

## Fixed

### Recency could displace an exact search match

Typing `passive.switch.voltage` into Quick Insert inserted
`passive.switch.ideal` — **but only after the ideal switch had been inserted
once in the same session.**

`passive.switch.ideal` lists `passive.switch.voltage`, another component's
type name, among its aliases. An exact alias match scored 100; the +40
recency bonus took it to 140; an exact match on the voltage switch's own
name scored 120. Recency outranked the thing the user had typed in full.

It needed a *sequence* to appear, which is why no single test saw it and the
492-component sweep did. Scoring now separates exact matches on a name (120),
a label (110) and an alias (100), and no exact match takes the recency bonus
at all — recency ranks things you might have meant, not things you have
already named.

### The variant picker could not be used from the keyboard

Pressing Enter on a component with fidelity variants expanded a list of
them, whose entries were click-only: no arrow keys, no Enter, nothing but
Escape. Inserting a resistor by keyboard was therefore impossible, and from
the outside it looked exactly like a search that had found nothing. The list
now moves with the arrows and commits on Enter.

### Naming a variant in full still asked which variant

Typing `physical_electrical.passive.resistor` and then being asked which
resistor is a step that exists only because the family has siblings. An
exact name now inserts directly.

### The smoke test had two dead steps

`tests/e2e/smoke.spec.ts` pressed `Ctrl+Shift+.` once and waited for the
Quick Insert search box. One press opens the *command palette* — a different
dialog with a different placeholder — so it failed on its first step. It
also pressed `Ctrl+T` to run, which is not bound to anything; the chord is
F5. Both steps the test existed to guard were dead.

### The old "manual" test wired nothing by mouse

`rc-circuit-manual-video.spec.ts` moved the pointer from one component's
centre to another's and then called `__gensim_wire_electrical(...)` to create
the wire. It looked like a mouse test. No wire was ever drawn by mouse, so
every bug in the wiring interaction was invisible to it.

## Not fixed — data, and your call

### 186 of 492 manifest entries are exact duplicates

`catalog-manifest.json` lists 186 components twice — same `name`, same
`filePath`. The runtime catalog dedupes by name so nothing visibly breaks,
but the manifest is nearly 40% redundant and anything iterating it sees each
of those twice. Looks like the generator walking a directory tree twice.

### `passive.switch.ideal` claims another component's type name as an alias

```yaml
aliases: ['ideal switch', 'sw', 'gated switch', 'passive.switch.voltage']
```

A type name is not an alias of a different type. The ranking fix stops it
causing the wrong insert, but the data is still wrong, and the same mistake
elsewhere would be just as invisible.

### Consecutive toolbar inserts land with their terminals coincident

Clicking Insert Resistor then Insert Capacitor places them such that the
resistor's `n` terminal and the capacitor's `p` terminal are at exactly the
same point. A drag starting there is ambiguous about which it grabbed, and
two parts whose pins coincide *look* connected without being wired.

## Checked, and not a bug

### `converter.phys2sig` has no input port

It declares an output and nothing else, which looks broken for a
physical-to-signal converter. It is not: it reads a circuit node *by name*
through its `node`/`branch` parameters rather than through a wire, and
`gsim-core`'s compile registry lists it among the blocks with no inputs at
all, alongside `const`, `time` and the wave sources. The catalog matches the
engine.

## Verified working

Everything below is exercised by real presses, travel and releases — no test
hook performs an action.

- Placing from the toolbar and from Quick Insert; dragging; terminals
  following their component.
- Wiring terminal to terminal; wires surviving a move, a rotation and an
  undo; deleting a component taking its wires with it.
- **Every port domain**: all seven connect to themselves, and all 42
  cross-domain pairs are refused.
- Converters bridging signal to electrical, and the direct connection being
  refused.
- Fan-in: an electrical node takes many wires, a signal input takes one.
- Select, marquee, rotate (both ways, four times round), flip, copy, paste,
  delete.
- The inspector, including parameters that change a component's port count —
  `control.sum`'s `signs` and `control.product`'s `n_inputs` — and wiring the
  input that appears.
- Grouping into a subcircuit, keeping wires that cross the boundary, and
  stepping in and out.
- The TIDA-style SOGI-PLL: 19 blocks, 25 wires, parameterised, drawn
  entirely by mouse, then its front end grouped into a subcircuit.
- All 492 catalog components insert and draw the ports they declare.

## Not covered

Running a simulation from the browser harness. It answers the handshake with
a stub kernel that produces no samples, so pressing Run checks that the
button is reachable and wired, not that the solver works. The solver is
covered where it actually runs: the extension's own integration suite, and
the engine's cross-check against an independent C implementation, which
agreed to 3.8e-14 across 11 signals over 25,000 steps.
