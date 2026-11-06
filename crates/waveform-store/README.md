# gs-waveform-store

Reads a `.gsim_sim_result` and serves decimated windows of its signals.

One implementation, compiled natively for the server and to WebAssembly for
the viewer, so both answer the same question the same way: *give me this
window of these signals, in at most this many points.*

## Why it exists

There were three implementations of that reduction — two in Python
(`postprocess/decimation.py`, write-time pyramid and query-time fallback)
and one in TypeScript (`axes-config.ts`) — so a trace could change shape
depending on which produced it, and a difference between the browser's view
and the server's was indistinguishable from a bug in the simulation.

It also makes a hosted deployment affordable. A plot 1500 px wide can
distinguish about 3000 points: two per pixel, one for the top of each column
and one for the bottom. Everything past that is paid for and not seen. On a
measured 11-signal, 250,000-sample run that is 32 MB moved and held, against
roughly 260 KB for the same picture.

## Measured, on a real run

An 11-signal, 25,000-sample SOGI-PLL result (3.2 MB on disk):

| | |
|---|---|
| parse the whole document | 19 ms |
| full extent at 2,728 points | 1.1 ms |
| a 2% window, exact (2,002 points) | 0.3 ms |

The `.wasm` is 137 KB.

## Layout

- `decimate.rs` — min/max bucketing, a faithful port of the engine's
  `decimation.py`, including Python's half-to-even rounding of bucket edges.
  A spike one sample wide survives any reduction factor; averaging and
  stride sampling both destroy it.
- `manifest.rs` — the document, as serde sees it. Unknown fields are
  ignored, so a newer writer does not break an older reader.
- `source.rs` — `WaveformSource`, and the one backed by inline samples.
- `wasm.rs` — the `WaveformStore` class the viewer holds.

## Not done yet

- **HDF5.** The engine writes `data.h5` with a precomputed LOD pyramid, and
  a `WaveformSource` over it is the next implementation. One obstacle is
  worth knowing about first: `hdf5_store.py` writes with `compression="lzf"`,
  which is h5py's own filter (ID 32000) and not part of the HDF5 standard.
  Neither the Rust `hdf5` crate nor a WASM build can read those datasets.
  Writing with `gzip` instead — a standard filter — makes the same file
  readable by h5py, MATLAB, this crate and WASM alike.
- **Streaming.** A live run appends; this reads a finished document.

## Building

```sh
cargo test                                   # native
wasm-pack build --target web --release       # the viewer's bundle
```
