# SPICE Solver Integration Notes

Short record of the concrete bugs and hurdles hit while wiring the classic
SPICE path to real `ngspice` and `Xyce` installs.

## Paths used during validation

- `ngspice`: `/mnt/external_drive/Github Works/Électronique/tools/ngspice-46/bin/ngspice`
- `Xyce`: `/mnt/external_drive/Github Works/Électronique/tools/xyce-install/bin/Xyce`

Stored locally in:

- `/home/elvis/.local/share/general-simulator/settings.json`

## Important lessons

1. Do not assume `Xyce --version` works.

- This install expects `Xyce -v`.
- Validation using `--version` fails even when the binary itself is good.

2. Do not assume the Xyce binary is self-contained.

- The installed binary needed `LD_LIBRARY_PATH=<xyce-install>/lib`.
- Without that, startup failed with missing `libtrilinosss.so.14`.
- Discovery and runtime launch both need the same library-path treatment.

3. Do not assume ngspice ASCII raw output.

- This `ngspice-46` build still emitted `Binary:` raw files even when invoked
  with `-a`.
- The backend therefore needs binary raw parsing support, not just the ASCII
  parser.

4. Do not decode ngspice raw files as UTF-8 first.

- Real binary `.raw` files contain a text header followed by binary doubles.
- Read bytes first, parse the header separately, then parse payload as binary.

5. Do not assume Xyce always writes a `.prn` for arbitrary netlists.

- A `.PRINT` statement is required for the `.prn` output consumed by the parser.
- When the generated netlist lacks one, inject a minimal `.PRINT TRAN ...`
  before `.END`.

6. Do not assume the Xyce `.prn` header starts with `TIME`.

- Real files from this install started with `Index TIME ...`.
- The parser must accept both `TIME ...` and `Index TIME ...`.

7. Do not assume `.prn` files are pure tables top-to-bottom.

- Real files can contain non-data lines before or after the main table.
- The parser should scan for the real header row and stop after the table ends.

8. Keep generic discovery separate from local preference.

- Generic `find_solver()` / `from_discovery()` behavior is covered by unit tests.
- Machine-local preference belongs in sidecar runtime config, not in generic
  discovery defaults, otherwise unit tests that patch `PATH` or `shutil.which`
  become brittle.

9. Keep backend preference runtime-only.

- `settings.json` should be read in the sidecar runtime, then passed as
  `preferred_paths` into backend selection.
- This preserves deterministic unit tests while still honoring real local
  installs in e2e runs.

10. Be careful changing solver priority order.

- Generic selection tests expected `ngspice` before `Xyce`.
- Local preference for a working Xyce install should be expressed through
  explicit preferred paths, not by changing default global discovery order.

## Concrete bugs hit

- `Unknown block type 'source.voltage.dc'. Ensure equations.py is present.`
  Root cause: circuit-domain metadata was still going through the equation
  template loader. Fix: skip `equations.py` requirement for `passive.*`,
  `source.*`, `semi.*`, `tline.*`.

- `AttributeError: 'InstantiatedBlock' object has no attribute 'block_type'`
  Root cause: selector logic treated IR-2 blocks like IR-1 blocks. Fix:
  inspect `block.block_type` for IR-2 instantiated blocks.

- `OverflowError: timeout is too large`
  Root cause: subprocess timeout used `t_end * 1e6`. Fix: use a sane seconds
  scale (`max(t_end * 1000, 60)`).

- `UnicodeDecodeError` while parsing ngspice output.
  Root cause: real ngspice emitted binary raw. Fix: bytes-first parser with
  binary payload decoding.

- `FileNotFoundError` for Xyce `.prn` output.
  Root cause: guessed filename and missing `.PRINT`. Fix: inject `.PRINT` and
  read the actual `<netlist>.cir.prn` file.

- `could not convert string to float: 'of'` from Xyce parser.
  Root cause: parser hit non-table lines in `.prn`. Fix: scan for header,
  ignore leading noise, stop after the numeric table.

## Validation commands that worked

Unit-level:

```bash
uv run pytest packages/simulator/tests/test_spice_parsers.py packages/simulator/tests/test_ngspice_solver.py packages/simulator/tests/test_xyce_solver.py packages/simulator/tests/test_solver_selection.py
```

Real configured binaries:

```bash
GENSIM_NGSPICE_PATH="/mnt/external_drive/Github Works/Électronique/tools/ngspice-46/bin/ngspice" \
GENSIM_XYCE_PATH="/mnt/external_drive/Github Works/Électronique/tools/xyce-install/bin/Xyce" \
uv run pytest \
  packages/simulator/tests/test_ngspice_solver.py::test_integration_rc_transient \
  packages/simulator/tests/test_xyce_solver.py::test_integration_rc_transient \
  tests/backend/e2e/test_xfail_circuit.py \
  tests/backend/e2e/test_spice_smoke.py
```

## Epic status reminder

As of this note:

- `BE-01` to `BE-23`: `complete`
- `BE-24` to `BE-28`: `review`

So the backend epics are **not all complete yet**. The classic SPICE path
implementation epics were advanced to `review`, but they still need the
tester-agent `/test-and-progress` completion step to become `complete`.
