# `.gsim_sim_result` — the simulation result format (v1)

> **Status:** v1, implemented.
> **Schema:** `packages/schemas/definitions/results/gsim_sim_result.schema.json`
> (the source of truth — AGENTS.md puts cross-language schemas there).
> **Reader/writer:** `apps/frontend/src/results/`.
> **Editor:** `apps/vscode-extension/src/resultsEditor.ts`.

## 1. Why the format exists

Until now a simulation result could only be looked at while the kernel
session that produced it was still alive.
`packages/simulator/src/simulator/postprocess/result_writer.py` writes a run
to `<workdir>/results/<sim_id>/` as a directory of `.npy` files, and
`apps/kernel-sidecar` puts that workdir under `$XDG_DATA_HOME` — an
app-private cache outside the workspace, keyed by an in-memory `sim_id`, and
reachable only through the running sidecar's token-gated slice server.

So a result could not be committed, attached to a review, reopened next
week, or compared against one from another branch. `waveformPanel.ts` says
as much, and calls the fix by name:

> If a persisted single-file results bundle is ever added, registering a
> second Custom Editor for *that* becomes the right call.

This is that bundle. One file, in the workspace, that opens by
double-clicking it and needs no kernel at all.

## 2. Shape

```json
{
  "schema_version": 1,
  "run":     { "id": "…", "analysis": "TRAN", "source": "buck.gsim_sch", "created": "…" },
  "sweep":   { "name": "time", "unit": "s", "domain": "time", "encoding": "f64-base64", "data": "…" },
  "signals": [ { "name": "V(out)", "unit": "V", "quantity": "voltage", "encoding": "f64-base64", "data": "…" } ],
  "layout":  { "figures": [ … ] }
}
```

| Field | Required | Notes |
|---|---|---|
| `schema_version` | yes | Must be `1`. A reader rejects anything else rather than guessing. |
| `run` | yes | Where it came from. `analysis` is `TRAN`/`AC`/`DC`/…; `source` is the workspace-relative `.gsim_sch`. |
| `sweep` | yes | The shared x axis. `domain` decides the axis name and whether it is logarithmic. |
| `signals` | yes | Each sampled at `sweep`, in the same order. `quantity` groups signals onto a shared y-axis. |
| `layout` | no | How the viewer had them arranged. Without it, the reader puts one axes per quantity. |

### Why one axes per quantity by default

Autoscaling a 48 V trace together with a 2 A one flattens the current to a
straight line. "Everything on one axes" is the wrong default the moment a
result holds two quantities, and a file written by a script usually carries
no layout.

## 3. Sample encoding

`encoding` is `f64-base64` or `json`.

`f64-base64` is base64 of little-endian IEEE-754 doubles. Two reasons, and
the first is the important one:

- **Exactness.** A round trip is the identity, bit for bit. A result that
  does not come back exactly cannot be used to check an engine against a
  reference — the disagreement being measured is routinely smaller than the
  error a decimal round trip introduces. A SOGI-PLL run cross-checked
  against an independent C implementation agreed to $3.8 \times 10^{-14}$
  relative; a result file that rounded to six figures would have destroyed
  that measurement before it could be made.
- **Size.** A double costs $64/6 \approx 10.67$ base64 characters against
  roughly 20 for decimal text.

`json` is a plain array of numbers, for a result short enough that someone
would read or diff it. The writer picks `json` at or below
`READABLE_SAMPLE_LIMIT` (256) samples and `f64-base64` above it; readers
accept both, per vector.

## 4. The invariant JSON Schema cannot state

Every signal must have exactly as many samples as `sweep`. The schema
cannot express a cross-field length equality, so `parseGsimSimResult`
checks it and names the offending signal.

This one has to fail loudly, because downstream it is invisible: a signal
one sample short is not an error to the chart, it simply plots every $y$
against the wrong $x$.

## 5. Why the editor is read-only

A `.gsim_sim_result` is derived data — the schematic and its analysis are
the source. There is no edit to make and nothing to save, so
`ResultsEditorProvider` never fires `onDidChangeCustomDocument` and VS Code
leaves the tab permanently clean: no phantom dirty dot, and no Ctrl+S that
silently rewrites a measurement. Changing a result means re-running the
simulation and exporting again, which is the only way the file and the model
it came from stay honest.

The provider does watch the file: a result is usually rewritten by something
other than this editor — a re-run, a script, a branch switch — and a stale
plot of a file that no longer says that is worse than a reload.

## 6. Producing one

From the viewer: **Export** on an axes or **Export figure** on a figure,
then pick *Result file*. The same dialog writes CSV, PNG, JPEG, SVG and PDF
— see `apps/frontend/src/waveform/export-data.ts` for why both a picture
and the numbers are offered.

CSV is the other half of that pair and is deliberately lossy: one column per
signal against the sweep, opens anywhere, and drops the units and the last
bits. Use it to cross-check; use `.gsim_sim_result` to keep.

## 7. Not done yet

- **A Python writer.** The engine still writes `.npy` directories. Nothing
  in `packages/` emits this format, so today it is produced only by the
  viewer's export. The schema is in `packages/schemas/definitions/` so that
  a Python writer has one contract to target, not a second one.
- **Several sweeps in one file.** A corner sweep or a Monte Carlo run is a
  family of results sharing a schematic. v1 holds one.
- **Compression.** A 25,000-step, 11-signal run is about 2.9 MB. Gzip would
  roughly halve that, at the cost of a file no longer readable with `jq`.
