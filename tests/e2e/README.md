# End-to-end suite

Drives the schematic editor with the pointer and the keyboard. Nothing here
performs an action through a test hook: if a wire appears, it is because a
drag from one terminal to another made the canvas create one.

## Running it

Playwright ships no bundled Chromium for every distribution — on Ubuntu
26.04 `playwright install chromium` refuses outright — so point it at the
browser already installed:

```sh
PLAYWRIGHT_BROWSER_CHANNEL=chrome npx playwright test --project=chromium
```

Leave the variable unset and it uses Playwright's own pinned build, which is
what CI does.

Useful subsets:

```sh
# one file
... npx playwright test tests/e2e/schematic-basics.spec.ts

# watch it happen
... npx playwright test tests/e2e/sogi-pll.spec.ts --headed

# the catalog sweep is ~10 minutes; take a slice instead
SWEEP_LIMIT=40 ... npx playwright test schematic-catalog-sweep
SWEEP_FILTER=converter ... npx playwright test schematic-catalog-sweep
```

## The three layers

```
scenarios/     "build the SOGI-PLL"        calls actions only
actions/       placeBlock, wire, setParam  calls the probe only
gs-ui-probe    click, drag, press          knows nothing about schematics
```

`gs-ui-probe` is a separate repo (`../gs-ui-probe`) so it can be reused
anywhere. Nothing application-shaped belongs in it. `actions/` knows what a
block and a port are and nothing about any particular circuit. A scenario
that contains a selector or a coordinate is a scenario doing the action
layer's job.

| file | what it covers |
|---|---|
| `schematic-basics.spec.ts` | place, drag, wire, undo |
| `schematic-connections.spec.ts` | every port domain, same and crossed; converters; fan-in |
| `schematic-editing.spec.ts` | select, marquee, rotate, flip, copy, paste, delete |
| `schematic-params.spec.ts` | the inspector, including parameters that change port counts |
| `schematic-subsystem.spec.ts` | group, boundary wires, enter, leave |
| `sogi-pll.spec.ts` | the TIDA-style PLL, drawn and then grouped |
| `schematic-catalog-sweep.spec.ts` | all 492 components insert and draw their ports |

## Things the DOM will catch you out on

Each of these cost an afternoon once and is now encoded in `actions/`:

- **The toolbar carries `[data-port-id]` too.** It renders a live preview of
  every insertable component, so there are eighteen ports on screen before a
  single block exists. Scope port selectors to `.react-flow`.
- **A terminal's hit area is invisible.** It is an SVG circle with
  `fill="none" stroke="none"` — the standard way to give a drawn symbol a
  generous target. Playwright's actionability check calls that not visible
  and waits for it forever, so terminals are measured with
  `getBoundingClientRect`.
- **Quick Insert is a double chord.** `Ctrl+Shift+.` twice. Once opens the
  command palette, a different dialog with a different placeholder.
- **A multi-variant component does not insert on Enter** unless you typed its
  name in full; otherwise Enter raises a picker.
- **The inspector narrows the canvas.** A block placed near the right edge
  before it opened can end up outside the visible area, where its terminals
  have no screen position. `closeInspector()` before wiring.
- **Parameters are shown by label, not name.** `k` reads "Gain",
  `n_inputs` reads "Input count". `setParam` takes the name and looks the
  label up.
- **`__gensim_serialize()` is the root sheet.** Inside a subsystem it still
  reports the root's contents, because that is what Save writes. Use
  `visibleBlocks()` to ask what is on screen.

## Reading a failure

Every action is recorded, and a failure carries the history:

```
what the probe did:
     11ms    click getByRole('button', { name: 'Insert Resistor' })
    876ms    drag locator('[data-block-id="…"]') -> (579, 355)
   2107ms -- wiring the SOGI
   2340ms    drag control_sum:in0 -> control_gain:out <-- FAILED
```

The action that threw is rarely the one that was wrong.
