# Custom code blocks in the VS Code extension: delegate to the language extensions

Status: design report. Nothing in any repository was modified.

Paths abbreviated: `EXT` = `general-simulator-gui-for-vscode/apps/vscode-extension/src`, `GUI` = `general-simulator-gui-for-vscode`, `GS` = `general-simulator`, `CORE` = `gsim-core`.

## 0. Summary and verdict

The design is small. A code block is a normal block whose existing `path` parameter points at a normal file. The extension adds one webview-to-host message (open this block's source), one host function (resolve, scaffold if missing, `showTextDocument`), one `DiagnosticCollection` fed by the simulate error, and optionally a generated `.pyi` stub. It writes no editor, no language server, no completion, no formatter and no debugger UI.

Two things currently block the whole feature and must be fixed first. Both are in the plumbing, not in the editor integration.

1. **A relative `path=` is resolved against the wrong directory.** `GeneralSimulatorSolver.solve()` has a `cwd` parameter whose docstring says script-authored documents rely on it. The kernel sidecar's simulate handler never passes it (all four `backend.solve(...)` calls in `GUI/apps/kernel-sidecar/src/kernel_sidecar/ipc/handlers/simulate.py` omit `cwd`). So the engine runs in the sidecar's cwd, which `buildSpawnPlan` in `EXT/kernel-core.ts` sets to `workspaceRoot` (the general-simulator checkout found by `resolveWorkspaceRoot`). A relative `path=` therefore resolves against the wrong directory.
2. **The engine reports no line number.** `py_traceback` in `GS/crates/pyblock-ffi/src/lib.rs` is `fn py_traceback(_py, err) -> String { err.to_string() }`. That yields `"ValueError: msg"` with no traceback. Octave and C errors carry no location either (see section 4).

Related prerequisite: the Python blocks need a binary built with `--features python`. `general-simulator-cli/Cargo.toml` has `default = []` and `python = ["dae-runtime/python"]`, while `general_simulator_solver.py` documents building with plain `cargo build --release -p general-simulator-cli`. A user following that doc gets a binary that cannot run `pyblock`/`pyfunc`. I did not run it to see the exact error text; this is inferred from the feature gating.

## 1. What exists today (read, not inferred)

### Block declarations (CORE `crates/gsim-core/src/compile/spec.rs`, `script_block!` at ~line 414, registrations at ~1164-1210)

| Type | Source parameter | Other parameters |
| --- | --- | --- |
| `extensibility.cscript` | `lib` (required): a precompiled `.so`/`.dylib`/`.dll`, **not** source | `ts`, `xc_count` |
| `extensibility.pyblock` | `path` (required): a `.py` file | `ts`, `xc_count` |
| `extensibility.pyfunc` | `path` (required) and `function` (required) | `ts` |
| `extensibility.octfunc` | `path` (a single `.m` file) and `function` | `ts` |
| `extensibility.octblock` | `path` (a **directory**) and `function` | `ts`, `xc_count` |

All five share `input_names` and `output_names` (arrays). Port count is `Arity::ParamLen("input_names"/"output_names")`. The block's pin set is therefore a parameter, not a property of the type.

The spec comment says it directly: `kind=cscript` takes `lib=`, not `path=`; the others take `path=`.

Two details not obvious from the registry, found in `GS/crates/dae-runtime/src/block_graph.rs` (~2330-2440):

- `octfunc`: `path` is one `.m` file, and the file name must equal the function name (the Octave `addpath` of its parent directory, per the `octave-ffi` module doc).
- `octblock`: `path` is a directory that must contain `<function>_start.m`, plus `<function>.m` (plain contract) or `<function>_derivative.m` and `<function>_output_xc.m` (when `xc_count > 0`). A missing file raises `DaeError::OctBlockMissingRequiredFile { expected_path }`, which is a structured error naming the exact expected file.

The block metadata in `GUI/packages/blocks/src/blocks/extensibility/*/metadata.yaml` declares `main_param: path` (pyblock) and label "Path". The inspector already shows the path string; nothing makes it a link to a file.

### The contract the user's code must satisfy

- `pyblock` (`pyblock-ffi/src/lib.rs` module doc): `start()` returns state. `output(state, t, dt, inputs)` returns a float or a tuple. `inputs` is a list with a float for a scalar signal and a `numpy.ndarray` for a vector one. With `xc_count > 0` the file defines `derivative(state, t, inputs, xc)` and `output_xc(state, t, dt, inputs, xc)` instead of `output`. Optional: `update(...)` and `next_sample_hit(...)` (required with `ts=variable`).
- `pyfunc` (`GS/book/dev-guide/src/pyfunc-blocks.md`): an ordinary function called as `f(*inputs)`, matched by position only. `function=` names which function in the file. One file may hold many functions.
- `cscript` (`cscript-ffi/src/lib.rs` module doc): exports `cscript_start`, `cscript_output`, optionally `cscript_free`, `cscript_clone`, `cscript_update`, `cscript_next_sample_hit`, `cscript_derivative`, `cscript_output_xc`. The CLI doc says the user compiles it; "this CLI never invokes a compiler". `cscript_clone` is required for adaptive stepping.
- Octave blocks run in a persistent `octave-cli` subprocess (`octave-ffi`), deliberately never linked (GPL reasons).

### The extension machinery

- Custom editor: `SchematicEditorProvider` in `EXT/schematicEditor.ts`, `CustomEditorProvider<SchematicDocument>`. Its `resolveCustomEditor` handles `panel.webview.onDidReceiveMessage`: first `this.host.handleCommonMessage(...)`, then document-specific messages (`gsim/documentChanged`). The `document` (and so `document.uri`) is in scope here but **not** in `GsimHost.handleCommonMessage`.
- Protocol: `EXT/protocol.ts` defines `HostBoundMessage` and `WebviewBoundMessage` unions, prefix-checked by `isHostBoundMessage`. The file says the frontend copy `apps/frontend/src/ipc/vscode-protocol.ts` mirrors it and must be kept in sync by hand. `WebviewInit.documentUri` already gives the webview the document's URI.
- The kernel sidecar: `EXT/kernel.ts` (`KernelSidecar`) spawns `uv run ... kernel_sidecar` and hands `{port, token}` to the **webviews**, which open the WebSocket themselves. The extension host never sees simulation traffic. Errors come back as `SIMULATE_RESULT` with `payload {status:"error", exc_type, message, signals: []}` (`_emit_error` in `simulate.py`). The host sees none of this unless the webview forwards it.
- Precedent for workspace files: `EXT/symbolLibrary.ts` writes `.gsim/symbols/<name>.gsim_sym` with `workspace.fs.createDirectory`/`writeFile`, a `FileSystemWatcher` in `extension.ts`, and failure reporting through `showErrorMessage` plus the output channel (`persistSymbol` in `host.ts`). Its header comment gives the rule this design should follow: a component belongs to the design, travels in version control, and shows up in the diff.
- AGENTS.md "Invariant 0": "Do not rebuild what VS Code already is... `Diagnostic` for problems, `OutputChannel` for logs, ... `workspace.fs` for files". This design is that rule applied.
- Double-click: I found no double-click handler on a placed block in `apps/frontend/src/canvas` (the grep hits are annotation drawing and `FigureTab`). The only block double-click is `library/SidebarItem.tsx` (library item). So the gesture is free to claim.

## 2. Where does the code live? (Question 1)

**Recommendation: the block's existing source parameter (`path`, or `lib` for C) holds a path relative to the `.gsim_sch` file, forward slashes, with a default convention that the file sits in a `blocks/` sibling folder named after the block. The path parameter is the single source of truth.**

Reasoning against the alternatives:

- **A path parameter on the block** is already the engine's contract (`req("path","path")`). Anything else needs translation to it anyway. Choose this.
- **"A file beside the `.gsim_sch`" with an implicit name (`foo.gsim_sch` -> `foo.py`)** fails the "two blocks share one function" test and a schematic with five code blocks. It also cannot be expressed in the netlist without a hidden rule. Reject as the *mechanism*; keep it as a *default value* only.
- **A fixed folder convention (`.gsim/blocks/`)** copies the symbol-library choice, but symbols are workspace-wide components while a code block is local to a design. A hidden dot-folder is also the wrong home for files the user edits daily and wants to see in the Explorer. Prefer a visible `blocks/` directory next to the schematic (or `<schematic-stem>_blocks/`). I recommend the plain `blocks/` default and letting the path parameter override it.
- **Absolute paths**: never written by the extension. They break sharing between machines.

How each concern is met:

- **Version control**: a relative path to a plain text file in the repository. Diffs show real code. The `.gsim_sch` diff shows a one-line path change.
- **Shared between machines**: relative POSIX-style path only. Remote and WSL work because VS Code resolves the `Uri` on the extension host side (`vscode.Uri.joinPath(dirname(document.uri), rel)`), not on the webview side.
- **Two blocks, one function**: both blocks name the same `path`. For `pyfunc`/`octfunc` they differ in `function`, so one `utils.py` holds many pure functions. This is what `pyfunc` was designed for. For `pyblock`, each instance already gets a fresh module namespace (`exec_fresh_module` / `PyModule::from_code` per instance, per the module doc), so two `pyblock` blocks pointing at the same file do not share state. Sharing a `pyblock` file is therefore safe and is the intended way to make N copies of one controller.
- **Renaming**:
  - Renaming a block does nothing to its file. Correct, since the path is explicit.
  - Renaming or moving the file in the Explorer will silently break every block pointing at it, because the schematic is a custom-editor document, not text that VS Code's rename refactoring can touch. Fix: subscribe to `vscode.workspace.onDidRenameFiles` in the extension host. For each open schematic, post a `gsim/pathsRenamed {from, to}` message to the webview, which edits the params through its normal mutation path and so produces an ordinary `gsim/documentChanged`, dirty state and the canvas undo stack. This is deliberately not a direct file write: a direct write behind an open `SchematicDocument` would conflict with its in-memory `text`. For a schematic that is not open, defer: stage 3, or just let the next simulate fail with a clear "file not found". I recommend deferring it entirely at first.

### Cross-cutting prerequisite: the working directory (blocker 1)

The engine resolves relative `path=` against its process cwd (`GeneralSimulatorSolver.solve` docstring: "a *relative* `path=` token resolves against" the subprocess working directory; octave `addpath` also canonicalizes against the process cwd). The sidecar must run `solve(..., cwd=<dir of the .gsim_sch>)`.

- The webview already has `documentUri` (`WebviewInit`). Add the document's directory to the simulate payload from `apps/frontend` (I did not read the frontend request builder; infer a `source_dir` field), read it in `simulate.py` and pass `cwd=` to the four `solve` calls. The plumbing exists in the solver and in `run_cancellable` (`_subprocess_run.py` passes `cwd`).
- The netlist then stays portable and the engine needs no change.
- The compile step (`compile_gsim_document(gsim_doc)`) emits the `path` verbatim. The CORE test in `general_simulator.rs` (~1338) uses `"path": "./blk.py"` and nothing rewrites it. Confirm no tests assume otherwise before changing the sidecar.
- Edge cases: an untitled or non-`file:` document has no directory. Refuse with a message ("save the schematic first").

A second reading of the "workspace root" question: `resolveWorkspaceRoot` looks for a `pyproject.toml` that marks a general-simulator checkout. For an end user whose workspace is only their converter project, the kernel may not start at all. That is out of scope here but affects whether this feature works for the stated audience; flag it.

## 3. Double-click to edit (Question 2)

### The gesture and the message

1. The canvas gets a double-click handler on a block node whose type is one of the five. (Missing today; see section 1.) It should be gated on block type, so ordinary blocks keep their behavior.
2. The webview posts a new `HostBoundMessage` variant (added to both copies of `protocol.ts`):

```ts
| { type: "gsim/openBlockSource";
    blockId: string;          // for error attribution
    blockType: "extensibility.pyblock" | "extensibility.pyfunc" | "extensibility.octfunc"
             | "extensibility.octblock" | "extensibility.cscript";
    path: string;             // the param value, as typed
    function?: string;        // pyfunc / octfunc / octblock
    inputNames: string[];     // for the scaffold
    outputNames: string[];
    xcCount?: number }
```

3. Handle it in `SchematicEditorProvider.resolveCustomEditor`'s `onDidReceiveMessage`, next to `gsim/documentChanged`, **not** in `GsimHost.handleCommonMessage`. The reason: resolving a relative path needs `document.uri`, which only the provider has. The message already carries everything else. (Putting `document` into the host would be a larger change for no gain.)

### The host side (all stock APIs)

```ts
const base = vscode.Uri.joinPath(document.uri, "..");            // dirname
const target = vscode.Uri.joinPath(base, ...msg.path.split("/"));
// exists?
try { await vscode.workspace.fs.stat(target); }
catch { /* scaffold, see below */ }
const doc = await vscode.workspace.openTextDocument(target);
await vscode.window.showTextDocument(doc, {
  viewColumn: vscode.ViewColumn.Beside,   // keep the schematic visible
  preview: false,                         // a real, editable tab
  selection: new vscode.Range(line, 0, line, 0),  // from section 4, if known
});
```

- `ViewColumn.Beside` keeps the canvas and the code side by side. This is the natural layout for a schematic tool. `preserveFocus: false` (the default) puts the cursor in the code. `preview: false` stops the next click from replacing the tab.
- `openTextDocument(uri)` selects the language by extension (`.py`, `.c`, `.cpp`, `.m`). Pylance, clangd, and the Octave extension attach by language id. The extension does nothing for that.
- Reject a path that resolves outside the workspace folders (`workspace.getWorkspaceFolder(target)` is `undefined`) unless the user confirms. Reject `..` escapes by default. This also keeps a malicious shared schematic from making the extension write outside the project.

### The file does not exist

Recommendation: **scaffold from a template after a one-click confirmation**, not a bare prompt for a filename, and not a snippet.

- Reasoning: the contract is rigid (names, argument order, optional functions), and getting it wrong is the dominant beginner failure. A correct file with the block's real port names filled in is worth more than any documentation. The extension knows `input_names` and `output_names`, so it can emit this exactly.
- Flow: `showInformationMessage('"blocks/ctrl.py" does not exist. Create it?', "Create", "Choose existing...")`. "Choose existing" calls `showOpenDialog` and writes the picked path (relative to the schematic) back to the `path` param via a `WebviewBoundMessage` (e.g. `gsim/setBlockParam`). "Create" writes with `workspace.fs.createDirectory` + `writeFile` (the same pair `symbolLibrary.saveSymbol` uses), then opens it.
- Why not a snippet: a `SnippetString` inserted via `TextEditor.insertSnippet` is a good *editing* feature but needs an open, empty document and drops tab stops into a file the engine will then run. A plain file with real, runnable defaults is safer; the user changes the body. Do not use an untitled document: the path in the block would then not exist.
- Do not auto-create on a typo. Always confirm. The block's default `path` is the empty string (`default: ""` in metadata.yaml), so double-click on a fresh block should first propose a default name (`blocks/<blockname>.py`) and write that name back to the `path` param.

Templates (keep each under ~20 lines, kept as plain strings in the extension, one per kind):

`pyblock`:
```python
"""<block name>: inputs u; outputs y."""
import numpy as np


def start():
    return {}


def output(state, t, dt, inputs):
    u, = inputs
    return 0.0
```
`pyfunc`: `def <function>(u): return u`. `octblock`: write `<function>_start.m` and `<function>.m` (plus the xc pair when `xc_count > 0`), and open `<function>.m`. `octfunc`: `function [y] = <function>(u)`. `cscript`: see section 6.

## 4. What the language extension gives for free, and the one thing worth generating (Question 3)

Once the file is a real file in the workspace and opened with `openTextDocument`, the language extension provides, with zero extension code: completion, hover, signature help, go to definition, find references, rename symbol, diagnostics (type and lint), formatting, organize imports, code actions, test discovery, and debugging through the Python/C++ debug extensions. For C/C++ also clangd/cpptools IntelliSense and compile-database based diagnostics.

The Octave story is the weakest of the three, and I am not going to overclaim. VS Code's Octave support is a syntax-highlighting extension plus whatever the user installs; it has nothing like Pylance's analysis. Do not promise parity. The honest position: you get a real editor with highlighting and the user's own tooling.

### Does a stub help Pylance? Yes, modestly, for Python only

Pylance cannot know that `inputs` has length 2 and is `[float, ndarray]`, because that is declared in the schematic's `input_names`, not in the file. Without help it sees `inputs` as untyped and offers nothing. A generated typed stub gives it the contract.

Recommendation: generate a **single shared `gsim_blocks.pyi`** (or `.py` with only `TypedDict`s and `Protocol`s) and reference it from the template. Do not try to emit one stub per block at first.

What it should contain:

```python
# gsim_blocks.pyi  (generated; do not edit)
from typing import Protocol, TypedDict, Sequence, Any
import numpy as np
import numpy.typing as npt

Scalar = float
Vector = npt.NDArray[np.float64]
Signal = float | Vector

State = Any        # the object start() returns

class PyBlock(Protocol):
    def start(self) -> State: ...
    def output(self, state: State, t: float, dt: float,
               inputs: Sequence[Signal]) -> float | tuple[float, ...] | list[float]: ...
    # optional:
    def update(self, state: State, t: float, dt: float, inputs: Sequence[Signal]) -> None: ...
    def next_sample_hit(self, state: State, t: float, dt: float, inputs: Sequence[Signal]) -> float: ...
```

Use it in the template with `inputs: Sequence[Signal]` annotations. That makes `inputs[0]` typed and catches "returned a string" or a wrong arity at edit time. This captures the real contract from the `pyblock-ffi` module doc: `t, dt` floats; input scalar-or-ndarray; outputs scalar-only ("deliberately scalar-only outputs").

Per-block stubs (a `TypedDict` with the actual `input_names` as keys) would give named access, but the contract is *positional* (`f(*inputs)`, `inputs` a list) so named keys would describe something the engine does not provide. Skip. The one thing that is block-specific and cheap to get right is the **arity comment and unpacking line in the template** (`u, v = inputs`), which the scaffold already writes from `input_names`.

Cost/benefit: the shared stub is ~30 lines, static, shipped in the `.vsix`, copied next to the schematic on first scaffold. It needs no regeneration. That is worth doing at stage 2. A generated per-block stub is not.

Interpreter mismatch (inferred, worth a warning): Pylance analyses with the user's selected interpreter, but the engine's `pyblock` runs under the Python that PyO3 linked at build time (`dae-runtime` feature `python`, "needs a discoverable Python/libpython at build/link time"). The two can differ (different numpy). Surface the engine's Python version and `numpy.__version__` in the output channel on first run so the mismatch is diagnosable. Do not try to reconcile them in the extension.

## 5. Errors routed to the file and line (Question 4)

### What the engine reports today

The CLI exits non-zero; the sidecar turns stderr into `SimulationError` (`general_simulator_solver.py`: `raise SimulationError(stderr_text.strip() or ...)`) and the handler emits `SIMULATE_RESULT {status: "error", exc_type, message}` via `_emit_error`. The error strings come from `DaeError` Display impls:

- Python: `Python block {path} raised in `{function}`: {message}` (`PyBlockError::Exception`). `path` is the file path **as it was given**, which is good. But `message` is `err.to_string()` only, so there is **no traceback and no line**.
- Python load/missing function: `PyBlockError::Load`/`MissingFunction` with path, no line (a `SyntaxError` at load time carries its line inside `err.to_string()` as text only, in PyO3's rendering; inferred, not verified).
- Octave: `OctaveError::Runtime { message }` is `err.message` only. The `try/catch` wrapper in `octave-ffi` discards the stack. There is no file or line. (`OctBlockMissingRequiredFile` does carry an expected path.)
- C: no runtime error channel at all; a crash in a loaded library takes down the process.

### What to build

1. **Engine change (prerequisite, small)**: make `py_traceback` return the formatted traceback (`traceback.format_exception`), or better a structured pair. `exec_fresh_module` already passes the real `path` as the code filename (`CString::new(path.to_string_lossy())` into `PyModule::from_code`), so every frame's `File "…"` is the user's file with the true line numbers. Nothing needs a source map for user code.
2. **Webview -> host**: today the host never sees the result (section 1). Add `{ type: "gsim/simulationError"; blockId?: string; excType: string; message: string }` to `HostBoundMessage`, posted by the webview where it handles `SIMULATE_RESULT.status === "error"`. Recommended over opening a second WebSocket from the host: the webview already owns the connection and the result, and the diagnostics need the document anyway.
3. **Host**: parse and publish.
   - One `vscode.languages.createDiagnosticCollection("General Simulator")` created in `activate()` and pushed to `context.subscriptions`, as the other registrations are.
   - Parse frames with a regex on `File "(.+)", line (\d+), in (\w+)`. Choose the **innermost frame whose file is inside the workspace and is not the engine's own glue**. Build `new vscode.Diagnostic(new Range(line-1, 0, line-1, MAX), message, DiagnosticSeverity.Error)`, set `.source = "General Simulator"` and `.code = excType`, then `collection.set(Uri.file(file), [diag])`.
   - Use `DiagnosticRelatedInformation` for the rest of the call stack: each outer in-workspace frame becomes a `new vscode.DiagnosticRelatedInformation(new Location(uri, range), "called from ...")`. These render as clickable links in the Problems panel.
   - Use `Range` to the end of the line; to underline the code rather than the whole line, trim leading whitespace.
4. **Lifecycle**: clear the collection (`collection.clear()`) at the start of each run and when the file changes (`onDidChangeTextDocument` for that URI), otherwise the stale red squiggle stays after the fix. This is the standard pitfall.
5. **Open on error**: do not steal focus. Show a notification `Python block "ctrl" raised ValueError in output() (blocks/ctrl.py:14)` with a button "Go to error" that calls `showTextDocument` with the `selection` above.

### Error in generated glue, not user code

There is none today that is line-mapped: the engine does not generate source for Python or Octave blocks. The user's file is exec'd verbatim, so a frame line equals the file line. Three cases remain:

- **Frame outside the user file** (a frame in the engine's Python helper or a library such as numpy): ignore it for placement; keep the user's innermost frame. If none is in the workspace (e.g. engine-side `MissingFunction`), attach the diagnostic to the file at line 0 and say what was missing ("define `output(state, t, dt, inputs)`"). That error already names the file.
- **No file at all** (the `Load` error because the path does not exist): attribute it to the **schematic**, not a source file. Diagnostics can be set on the `.gsim_sch` URI. The Problems entry is clickable and opens the schematic; the host can then ask the webview to select block `blockId` (a new `WebviewBoundMessage`, `gsim/selectBlock`). This is the right place for the "wrong path" class of errors, which section 2 shows is the most common.
- **If the project later generates wrapper source** (not the case now; I am flagging it as a design rule): keep wrappers out of the user's file and emit `#line N "user.c"`-style directives for C, and a line-offset table for Python, so frames map back. Do not do this unless it arises.

### C build error vs Python runtime error

- A Python error is a **runtime** event with a stack, produced inside a simulation, so it arrives via the simulate error and is parsed by the extension.
- A C compile error is a **build-time** event, produced by the user's compiler (gcc/clang/MSVC) before any simulation. The engine never sees it. The extension should not parse it; the C/C++ extension and VS Code's task system do that (see section 6). It appears in Problems via a task `problemMatcher`, not via the simulate path. A C *runtime* failure (null state, a crash) has no line and no file; the best the extension can do is report which `lib=` was loading/executing.

## 6. C and C++ (Question 6)

Whose job: **the user's**, by design. `cscript-ffi`/CLI: "the user compiles it themselves, this CLI never invokes a compiler". The block's parameter is the **binary** (`lib`), not the source. That is the one case where the block's parameter does not point at the file the user edits. So the extension needs a source <-> binary link.

Recommendation: a **VS Code task with a `problemMatcher`, plus a convention, and one explicit "Build" action; no build-on-save.**

- Convention: for `lib = "build/ctrl.so"` the source is `blocks/ctrl.c` (or `.cpp`). Preferable and explicit: add an optional `source` parameter to `extensibility.cscript` (display only; the engine ignores it). Without it, double-click on a cscript block has nothing to open, because `lib` is a binary. This needs a metadata and `spec.rs` change: `spec.rs` maps only `lib`, `ts`, `xc_count`, so a new parameter must either be ignored by the compile step or declared as non-emitting. **This is a cross-repo change and the one place I recommend extending the block definition.** Without it the fallback is the heuristic "same stem, `.c`/`.cpp` in the same directory or `blocks/`".
- Build: ship a `tasks.json` task *template* (a `TaskProvider` is more than is justified yet), e.g. `gcc -shared -fPIC -O2 -o build/ctrl.so blocks/ctrl.c`, with `"problemMatcher": "$gcc"`. VS Code then lists gcc errors in Problems, clickable. Platform-specific output extension (`.so`/`.dylib`/`.dll`) is a real concern for a schematic shared between machines; see below.
- Explicit command over build-on-save: a half-edited C file failing to compile on every save is noise, and a failing background build would leave the `.so` stale or missing without the user noticing. An explicit "General Simulator: Build Code Blocks" command that runs the task is predictable. **Before a run**, the extension can check `mtime(source) > mtime(lib)` and offer "Rebuild first?". That check is cheap (`workspace.fs.stat`) and prevents the single most confusing failure: simulating a stale binary.
- Shared schematic across machines: the stored `lib` is a platform-specific binary name. Store the *stem* without extension (`build/ctrl`) and have the extension, or the engine's loader, add the platform suffix. The CLI doc says `lib=<path>` with `.so/.dylib/.dll`; I did not confirm whether the loader appends a suffix itself. Treat as an open question for the engine.
- `cscript_clone` requirement: with adaptive stepping (the CLI default when `--dt` is omitted), a library lacking `cscript_clone` is rejected. The solver always passes `--dt`, so this does not bite the GUI path, but the template should still include `cscript_clone` as a commented-out stub with an explanation.
- C++: the exported symbols must be `extern "C"`, or names are mangled and `MissingSymbol` follows. Put `extern "C"` in the C++ template. clangd will not catch a missing one.
- A C error appears twice in practice: at build (task problem matcher, in the Problems panel) and, if the library loads but a symbol is missing, as `CScriptError::MissingSymbol { path, symbol }` from the engine (a schematic-level diagnostic, section 5).

Debugging C: attaching a debugger to a `.so` loaded into the engine process is genuinely possible (launch the engine under `cppdbg`/`lldb` with the netlist) but is non-trivial to set up; see section 7.

## 7. Running and debugging one block alone (Question 5)

**Mostly not worth building. One thin piece is.**

- Python: the pure-function contract of `pyfunc` (`f(*inputs)`) and the plain `output(state, t, dt, inputs)` of `pyblock` are trivial to call from a script. The right affordance for a quick check is a **CodeLens** above `output`/the function: "Run with sample inputs". But a CodeLens provider is code to maintain and needs per-block sample-input storage. Only the third candidate pays for itself.
- **`launch.json` contribution**: a `debugConfigurations` template that runs the Python file with `debugpy` is already something Python tooling does for any file. Documenting "press F5 on a `pyfunc` file with a `if __name__ == "__main__":` test" is free and gives full Pylance/debugpy debugging. This is the recommended answer for pure functions.
- **Debugging inside a real simulation** (breakpoint in `output` while the engine runs the circuit) is the actual want, and the architecture works against it: the interpreter is embedded in the Rust engine via PyO3, so `debugpy` has to be started *inside* that embedded interpreter (e.g. `debugpy.listen` from `start()`), and then an "attach" `launch.json` configuration. That is possible (a user can paste two lines into `start()`) and works with zero extension code. I did not test it. It is a documentation item, not a feature.
- **A task** "Run simulation headless" calling the CLI is useful for CI but unrelated to a single block.

Recommendation: stage 3 at earliest. Ship the doc snippet (`debugpy.listen` + attach config). Build a "Run block with sample inputs" only if users ask.

## 8. What NOT to build (Question 7)

This list is why the approach was chosen. Each item is the language extension's job and would be a permanent maintenance cost if duplicated.

- **Any text editor surface** (a Monaco instance inside the webview, a code panel on the canvas, an inspector text area for the body). The block opens a real tab; that is all.
- **Syntax highlighting, themes, bracket matching, folding.** TextMate grammars belong to the language extensions.
- **Completion, hover, signature help, go to definition, find references, rename.** Pylance/clangd. Do not write a language server, and do not feed completions from the block's port names; the `.pyi` and the template cover the real need.
- **Linting and type checking**, including "validate the contract" (does `output` exist with 4 params?). Pylance/ruff catch signature and typing errors; the engine reports `MissingFunction` at load. Do not parse the user's Python in the extension.
- **Formatting and import sorting.** Black/ruff/clang-format on the user's own settings.
- **Debugger UI.** Python debugger and C++ debugger extensions. At most ship a launch/attach snippet.
- **A C/C++ build system or compiler detection.** Task + problem matcher, using the user's toolchain. Do not search for compilers, generate Makefiles or manage CMake.
- **A Python environment manager.** The Python extension owns interpreter selection. The engine's own interpreter is a separate matter (section 4).
- **A file browser/picker in the webview.** `showOpenDialog`/`showQuickPick` and the Explorer (also AGENTS.md "no in-webview file explorer").
- **A source-file copy/sync inside the `.gsim_sch`** (embedding the code in the document). It defeats diffs, merges, the language servers (which need a real file) and sharing.
- **A custom output console for block `print()` output.** Stdout from the engine is already captured by the sidecar and goes to the `General Simulator` output channel (`mirrorToConsole`); that is the surface.
- **A per-block stub generator, a code-completion data model for ports, a "block API" DSL.** The positional contract is simple and a static shared stub covers it.
- **Test frameworks for blocks.** pytest and the Test Explorer already do this.
- **Octave tooling parity.** Do not build Octave analysis to compensate for the weaker extension.
- **Auto-fix or auto-rewrite of user code on contract changes** (e.g. when `input_names` changes). Report the mismatch; never edit their file.

## 9. Staged plan

### Stage 0: prerequisites (nothing user-visible, all blockers)

1. Sidecar passes `cwd = dirname(.gsim_sch)` to `solve()` (blocker 1). Needs the webview to send the source directory in the simulate payload and `simulate.py` to forward it. Add a test that a relative `path=` resolves.
2. Build and document the engine with `--features python` (and fix the discovery doc comment in `general_simulator_solver.py`). Without it, no Python block runs.
3. Verify end to end that a single `pyblock` document simulates from the extension. I did not run this; nothing here proves the pipeline works today.

### Stage 1: smallest genuinely useful version

- Double-click handler on the five block types -> `gsim/openBlockSource` -> `openTextDocument` + `showTextDocument(ViewColumn.Beside)`.
- Scaffold-on-missing with confirmation, for `pyblock` and `pyfunc` first; write the chosen default path back to the `path` param.
- Relative-path convention and the out-of-workspace refusal.

This delivers "double-click, edit with Pylance" with about 150 lines of host code plus one webview handler and one message type. It is the whole of the user's stated goal for Python.

### Stage 2: close the loop

- Engine: formatted tracebacks from `py_traceback` (`pyblock-ffi`).
- Webview posts `gsim/simulationError`; host builds the `DiagnosticCollection`; clear on rerun and on edit; schematic-level diagnostic for "file not found" with `gsim/selectBlock`.
- Shared `gsim_blocks.pyi` and typed template.
- C/C++: `source` parameter on `cscript` (cross-repo), task template with `$gcc`, stale-binary check, "Build Code Blocks" command.
- Octave: scaffold the file set for `octblock`; open `<function>.m`.

### Stage 3: only on demand

- `onDidRenameFiles` path rewrite.
- Octave error locations (needs the engine to return the Octave stack; `err.stack` is available in the `catch` the wrapper already has).
- "Run block with sample inputs" CodeLens; attach-debug configuration helper.

## 10. Things found that are broken, missing or unverified

| # | Finding | Status |
| --- | --- | --- |
| 1 | Sidecar never passes `cwd` to `solve()` although the solver supports it and documents that script-authored documents depend on it. Relative `path=` resolves against the checkout. | Read in code. **Blocks the feature.** |
| 2 | `py_traceback` discards the traceback; no line numbers anywhere in engine errors (Octave and C also have none). | Read in code. Blocks error routing. |
| 3 | The default engine build has no `python` feature; docs say to build without it. | Read in `Cargo.toml` and the solver doc. Exact failure text not run. |
| 4 | The extension host never sees `SIMULATE_RESULT`; the webview owns the WebSocket. A new message is required. | Read in code. |
| 5 | No double-click handler for a block on the canvas. | Grep only; I did not read all of `apps/frontend/src/canvas`. |
| 6 | `GsimHost.handleCommonMessage` has no document; the open-source handler belongs in `SchematicEditorProvider`. | Read in code. |
| 7 | `cscript` `lib` points to a binary; nothing links it to its source. | Read in `spec.rs`. |
| 8 | `kernel-core` `resolveWorkspaceRoot` needs a `pyproject.toml` checkout, so a plain user project may not start a kernel. | Read in code; separate from this feature but affects whether it is usable by the stated audience. |
| 9 | The `protocol.ts` copies are kept in sync by hand. Every new message must be added in two files. | Stated in the file header. |
| 10 | Whether the CLI/loader appends the platform suffix to `lib=`. | Not confirmed. |
| 11 | PyO3's embedded interpreter versus the user's Pylance interpreter can differ. | Inferred from the Cargo comment. |
| 12 | Nothing verified by running; all claims are from source reading. | Caveat for the whole report. |

## 11. Trade-offs, with a recommendation

- **Path as parameter vs convention-by-name**: parameter, with a convention as the default value. Convention-only cannot express shared functions.
- **Write back into the schematic vs refuse**: scaffolding writes a default `path` into the block via the webview's normal mutation path (so dirty state and undo behave), never by editing the file on disk.
- **Webview forwards errors vs host opens its own socket**: webview forwards. One connection, one source of truth, and a single new message.
- **Build-on-save vs explicit build for C**: explicit command plus stale check. Saving half-written C should not spawn a compiler.
- **Per-block stubs vs one shared stub**: one shared stub. Per-block names describe a keyed interface the engine does not offer.
- **Fix tracebacks in the engine vs parse stderr in the extension**: fix the engine. Parsing an unstructured one-line error cannot find a line that is not there. This is a small change in one function and benefits the CLI and every other front end.
