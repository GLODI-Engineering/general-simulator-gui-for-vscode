# Why Engineers Don't Switch: GUI & UX Failures of Open-Source Simulink Alternatives

> **Purpose:** Research document for simulator frontend design brainstorming.  
> **Date:** May 2026  
> **Scope:** OpenModelica (OMEdit), Scilab/Xcos, and the broader open-source simulation ecosystem vs. MATLAB/Simulink.

---

## Table of Contents

1. [Overview & Context](#1-overview--context)
2. [The Landscape: Open-Source Alternatives](#2-the-landscape-open-source-alternatives)
3. [Problem Category 1 — Interaction Latency](#3-problem-category-1--interaction-latency)
4. [Problem Category 2 — GUI ↔ Model Desynchronization](#4-problem-category-2--gui--model-desynchronization)
5. [Problem Category 3 — Wire Routing & Canvas Feel](#5-problem-category-3--wire-routing--canvas-feel)
6. [Problem Category 4 — Library Browser & Block Discovery](#6-problem-category-4--library-browser--block-discovery)
7. [Problem Category 5 — Hierarchical Model Navigation](#7-problem-category-5--hierarchical-model-navigation)
8. [Problem Category 6 — Real-Time Signal Validation](#8-problem-category-6--real-time-signal-validation)
9. [Problem Category 7 — Installation & Platform Fragility](#9-problem-category-7--installation--platform-fragility)
10. [Problem Category 8 — File Persistence & Save/Load Corruption](#10-problem-category-8--file-persistence--saveload-corruption)
11. [Problem Category 9 — Ecosystem & Toolchain Lock-In](#11-problem-category-9--ecosystem--toolchain-lock-in)
12. [Problem Category 10 — Documentation & Learning Curve](#12-problem-category-10--documentation--learning-curve)
13. [What Simulink Gets Right (And OSS Misses)](#13-what-simulink-gets-right-and-oss-misses)
14. [Summary: Design Lessons for a New Simulator Frontend](#14-summary-design-lessons-for-a-new-simulator-frontend)

---

## 1. Overview & Context

MATLAB/Simulink has been the dominant block-diagram simulation environment in engineering for over 30 years. Despite significant licensing costs (often $5,000–$15,000+ per seat for full toolboxes), engineers in automotive, aerospace, energy, and robotics overwhelmingly stay on it. Several mature, free, open-source alternatives exist — OpenModelica, Scilab/Xcos, Modelon Impact, and others — yet adoption remains limited outside academia.

The reasons are **not primarily technical** (the solvers are often comparable). The friction is almost entirely in the **GUI, UX, and surrounding ecosystem**. This document catalogs those failures systematically to inform the design of a new simulator frontend.

---

## 2. The Landscape: Open-Source Alternatives

| Tool | GUI Editor | Modeling Paradigm | Status |
|---|---|---|---|
| **OpenModelica (OMEdit)** | Qt-based diagram editor | Acausal, equation-based (Modelica language) | Active, academic-driven |
| **Scilab / Xcos** | Java-based block editor | Causal, signal-flow (like Simulink) | Active, maintained by ESI Group |
| **JModelica** | Python API + optional GUI | Acausal, Modelica | Discontinued (~2019) |
| **Hopsan** | Custom Qt GUI | Bond-graph / signal-flow | Active, niche (hydraulics) |
| **Kepler** | Java-based canvas | Actor-oriented dataflow | Mostly academic |
| **SimulIDE** | Custom GUI | Electronic circuit focus | Active, limited scope |

The two most direct Simulink alternatives are **OMEdit** and **Xcos**, and both share a pattern of GUI problems that have been extensively documented in their issue trackers, mailing lists, and community forums.

---

## 3. Problem Category 1 — Interaction Latency

**Tools affected:** OpenModelica / OMEdit (severe), Xcos (moderate)

### What happens

Every action on the canvas — dragging a block, typing a parameter value, pressing a keyboard arrow key — triggers a synchronous round-trip to the backend compiler or simulation engine before the UI updates. The user perceives this as the interface "freezing" for seconds at a time.

### Evidence from the field

From the official OpenModelica issue tracker (`#2894`, opened and tracked over multiple years):

> *"Keyboard usage results (for models of average complexity) in a tremendous slowdown compared with mouse usage. After each keystroke, OMEdit requests OMC to update its inner image of the model, and this takes time."*

From issue `#11920` (2024), covering a medium-complexity power grid model:

> *"The following actions require 5–6 seconds on a laptop: dragging a new component (even the simplest one: a bus) onto the diagram; doing Ctrl-Z to undo the above."*

Even after the 1.24.0 release in September 2024, which specifically targeted this:

> *"An important improvement concerns the reaction time when editing diagrams, which used to be very slow when adding or removing components and connections in large models. These operations are now much faster, while **changing parameters can still be quite slow**."*

### Root cause

The architecture couples the visual canvas tightly to the compiler (OMC). There is no optimistic local state — the GUI is essentially a thin front-end that cannot render anything without compiler confirmation.

### Design lesson

**Decouple the canvas from the solver entirely.** The visual canvas must maintain its own local state and render instantly. Solver/compiler validation happens asynchronously in the background, surfacing results as non-blocking indicators (e.g., subtle port color changes, a status bar update) — never blocking the user's edit flow.

---

## 4. Problem Category 2 — GUI ↔ Model Desynchronization

**Tools affected:** OpenModelica / OMEdit (critical), Xcos (moderate)

### What happens

The graphical view and the underlying model code/data get out of sync. Users make changes in one representation, and those changes are silently lost, overwritten, or corrupted in the other.

### Evidence from the field

**Bug `#10699` — Parameter deletion on GUI edit (OMEdit, confirmed across multiple versions):**

> *"Changing a parameter through the GUI removes other parameters added in code to the component definition. Steps: add `Buildings.Fluid.Movers.SpeedControlled_y` to a model, add a pressure curve in the Text view (`per(pressure(...))`), then change any unrelated parameter via the GUI dropdown. Go back to the Text view — the pressure definition is gone."*

This was confirmed on OpenModelica 1.20.0, 1.21.0, and later versions across Windows and Ubuntu. The GUI's write-back to the underlying Modelica text was destructive — it rewrote the component parameters from its own cached state, dropping anything it hadn't explicitly tracked.

**From the OpenModelica user forum (basic usage):**

> *"I add blocks to the diagram view. When I edit parameters using the graphic interface, they do not get stored in the model. In the graphic interface it looks like they get stored, but running a simulation shows results for other parameters (original default parameters are used during simulation)."*

This is the worst possible failure mode: the interface *lies* to the user. The displayed state diverges silently from the executed state.

### Design lesson

**One source of truth, always.** The visual canvas must be a lossless, bidirectional representation of the model data. Any edit — whether made graphically or textually — must immediately and completely update the single model representation. Round-tripping (text → GUI → text, or GUI → text → GUI) must be lossless by design. This is an architectural constraint that must be decided from day one, not retrofitted.

---

## 5. Problem Category 3 — Wire Routing & Canvas Feel

**Tools affected:** All open-source alternatives (varies in severity)

### What happens

Wire routing — the automatic layout of connection lines between blocks — is one of the most visible and tactile aspects of a block diagram editor. When wires are poorly routed (overlapping, diagonal, crossing unnecessarily, or snapping to wrong positions), the diagram becomes unreadable and the editor feels broken.

### Evidence from the field

From a detailed engineering retrospective on building an open-source Python block diagram tool (Corke, 2022):

> *"Using Graphviz (dot and neato) I could never get layouts that were satisfactory and looked anything like an engineering block diagram. Having the user add hints like coordinates and block orientation was annoying and didn't really help much. There is some literature on automatic layout of diagrams, but as far as I could find, no easy to use packages that could be pressed into service."*

From **Xcos user mailing lists:**

> *"On saving a model and subsequent reopen, some routes get jumbled like spaghetti. Workaround: highlight the route and optimize with 'O', then save again."*

This means Xcos's wire routing is not stable across save/load cycles — a fundamental reliability failure.

### What Simulink does right

Simulink uses an **orthogonal wire router** that:
- Always produces horizontal/vertical segments (no diagonals)
- Re-routes wires automatically when blocks are moved
- Avoids crossing other wires where possible
- Maintains routing on save/load with exact fidelity
- Allows the user to manually drag wire segments and "pin" them

### Design lesson

Wire routing is not a cosmetic feature — it is **core to model readability**. Invest in a proper orthogonal auto-router. Key requirements:
- All wires must be composed of horizontal and vertical segments only
- Wires must re-route gracefully when a connected block moves
- Wire layout must be deterministic and stable across save/load
- Allow user override (drag a segment to pin it)
- Routing must be fast enough to appear instantaneous even for large models

---

## 6. Problem Category 4 — Library Browser & Block Discovery

**Tools affected:** OMEdit (significant), Xcos (moderate), all OSS tools generally

### What happens

Finding a block requires knowing exactly where it lives in a deep, non-searchable tree hierarchy. New users give up; experienced users waste time navigating.

### Evidence from the field

From OMEdit issue `#2894` (usability summary, tracked over 3+ years):

> *"Replaceable classes and replaceable objects should show up in the parameter window, with a drop-down menu filled based on `choices` or `choicesAllMatching` annotations. Once a specific choice is made, it should be possible to change the parameters of the redeclared model."*

This describes a missing feature that Simulink has had for 20 years: contextually filtered block selection based on compatibility with the current port.

The **Xcos palette browser** requires:
1. Clicking a palette category in the left pane
2. Waiting for the right pane to update
3. Scrolling through unlabeled icons
4. Dragging the block to the canvas

There is no search. There is no "recently used" list. There is no preview of what the block does on hover.

### What Simulink does right

- **Quick Insert** (Ctrl+Shift+L): type any part of a block name, get a fuzzy-matched, ranked list instantly
- **Recently used blocks** are surfaced in the insert panel
- **Compatible-only filtering**: when connecting from a port, the library browser can filter to show only blocks compatible with that signal type
- Hovering a block shows a tooltip with its function, ports, and a link to documentation

### Design lesson

**Search-first library browsing is non-negotiable.** The library tree is a secondary navigation mode, not the primary one. Implement fuzzy search over block names, descriptions, and tags. Surface recently used and frequently used blocks. Show port compatibility information on hover.

---

## 7. Problem Category 5 — Hierarchical Model Navigation

**Tools affected:** OMEdit (critical), Xcos (moderate)

### What happens

The ability to "drill into" a block (double-click to open its internal diagram) and navigate back up is fundamental to managing complex models. In open-source tools, this is often broken, incomplete, or impossible for user-defined composite blocks.

### Evidence from the field

From OMEdit issue `#2894`:

> *"Hierarchical editing of systems for graphical modification of parameters and replaceable classes in sub-models. Requires substantial work to implement some API function, as well as in OMEdit to display the information properly."*

> *"Changes in sub-models should be reflected in models using them immediately, not only when changes to the latter models are made."*

This second quote describes a critical workflow break: the user edits a sub-component, then has to manually trigger an update on the parent — the tool does not propagate changes up the hierarchy automatically.

From OpenModelica planned features for 1.25.0 (as of late 2024):

> *"Further improvements to the GUI such as parameter editing in hierarchically structured models, restructured Simulation Setup dialog, Rename feature with refactoring..."*

These are still listed as **future features**, not existing capabilities — yet they are baseline requirements for serious engineering work.

### What Simulink does right

- Double-clicking any Subsystem block opens its internal diagram in a new tab
- A breadcrumb bar at the top always shows the current path in the hierarchy (`Model > SubsystemA > Controller`)
- Clicking any breadcrumb level jumps back to it instantly
- Changes in a sub-model propagate to the parent immediately and visually
- "Model References" allow external .slx files to be used as blocks, with the same navigation experience

### Design lesson

**Hierarchy navigation must be first-class.** Implement click-in / breadcrumb navigation from day one. Changes to sub-models must propagate to all parent contexts immediately, without any manual refresh step. The user should never be aware of the compile/update cycle during editing.

---

## 8. Problem Category 6 — Real-Time Signal Validation

**Tools affected:** All open-source alternatives

### What happens

Port type, dimensionality, and compatibility errors are only discovered at simulation time — after the user has built (possibly large parts of) a model. The editor provides no inline feedback about incompatible connections.

### Evidence from the field

From the Xcos bug tracker (2026 changelog):

> *"Xcos sometimes displayed an error about port size or type."* (listed as a fixed bug — meaning it was previously *silent* or *wrong*)

From the OpenModelica forum, a recurring pattern: users build multi-block models, hit Run, and receive cryptic compiler errors pointing to connection type mismatches — with no visual indication of *which* connection is the problem.

### What Simulink does right

Simulink performs **incremental diagram update** (triggered by Ctrl+D, "Update Diagram") separately from simulation. This:
- Checks all block-to-block signal compatibility
- Colors incompatible connections red
- Shows port dimension annotations on wires
- Reports errors inline next to the problematic connection, not just in a console

Connection validation happens **before** the solver is ever invoked.

### Design lesson

**Build a constraint propagation system for ports.** Each port has a type (scalar, vector, bus, physical), a dimension, and a domain (signal, physical, event). When the user draws a connection, immediately check compatibility and show the result inline — color the wire, annotate ports, show a tooltip. Never make the user run a simulation to find a wiring error.

---

## 9. Problem Category 7 — Installation & Platform Fragility

**Tools affected:** Xcos (severe on Windows), OpenModelica (moderate)

### What happens

Open-source simulation tools require external compilers, specific runtime dependencies, and platform-sensitive configurations. Installation failures are common and often opaque.

### Evidence from the field

**Xcos / Scilab — Windows compiler requirement:**

When running Modelica blocks in Xcos on Windows:

> *"c_pass1: build the modelica meta-block failed" / "xcos_simulate: Error during block parameters update."*

The fix requires having Microsoft Visual Studio Community installed. This is **not documented in the installer** and must be discovered by the user after the fact.

**Scilab 2024/2025 regression — simulation crashes on Windows:**

> *"I installed Scilab 2025.1.0 on Windows 11. When I open Xcos and try simulating a simple diagram, it immediately crashes and closes Scilab & Xcos. I've even tried the built-in Demonstrations — same result. I installed Scilab 2024.1.0 and get the same crash. Scilab 2023.1.0 still works fine."*

This was a regression introduced in 2024 that remained unfixed through at least the 2025.1.0 release — meaning a full year of Windows users being unable to run any Xcos simulation.

**OMEdit — window manager and resolution edge cases:**

> *"After double-clicking a model in the library tree, the model is displayed in the diagram view. But the horizontal scrollbar is shown, hidden and shown again, and the model is automatically zooming in and out several times, all in less than half a second. After this, OMEdit hangs completely (OMEdit.exe is not responding) and I need to stop omc.exe and OMEdit.exe via Task Manager."*

This was traced to a screen resolution interaction between Qt's layout engine and the OMEdit window size logic.

### Design lesson

**Zero-friction installation and zero runtime dependencies for the frontend.** If the tool ships as a web app or an Electron app, it eliminates the entire class of platform-specific compiler/runtime dependency problems. The simulation solver can be a separate, well-isolated backend — but the editor itself must work out of the box on any platform with no setup steps.

---

## 10. Problem Category 8 — File Persistence & Save/Load Corruption

**Tools affected:** Xcos (severe), OpenModelica (moderate)

### What happens

Saving and reloading a model corrupts it — wires are rerouted incorrectly, blocks move, text annotations disappear, or the model becomes unrunnable.

### Evidence from the field

From the Xcos user mailing list (multiple confirmed reporters, Windows):

> *"1. On saving a model and subsequent reopen, some routes get jumbled like spaghetti.*  
> *2. Some text blocks when saved do not reappear on opening, or sometimes appear in the top-left of the window.*  
> *3. Some models will not reopen after saving — blank window.*  
> *4. Some saved models halt with 'invalid index' on simulation, no apparent reason. Models were previously working before saving.*  
> *5. Superblocks not functioning when created by converting selected groups.*  
> The combination and severity of these bugs make Xcos unusable, at least in Windows."*

This reporter tested on two separate machines with fresh installs and confirmed all bugs on both. The conclusion: the file format serialization had encoding or path-handling issues on Windows (likely related to path separators or locale-specific decimal formatting).

### What this reveals about the architecture

Xcos stores its model in an XML-based format. The wire routing coordinates are serialized as floating-point numbers, and the deserialization on Windows (with different locale settings for decimal separators) can corrupt coordinate values — causing wires to render at wrong positions or fail to connect.

### Design lesson

**Use a robust, locale-independent file format.** JSON with integer coordinates (in a fixed unit system) is safer than floating-point XML. Always store wire routing as a sequence of discrete waypoints in canvas units, not as computed floating-point coordinates. Write a roundtrip test suite: save a model, reload it, compare the in-memory representation exactly — run this as a CI check.

---

## 11. Problem Category 9 — Ecosystem & Toolchain Lock-In

**Tools affected:** All open-source alternatives (structural problem)

### What happens

Engineers don't just use a simulator in isolation — they use it as part of a workflow: hardware-in-the-loop testing, automatic code generation for embedded systems, integration with version control, CI pipelines, and industry-standard certification processes. Simulink's deepest moat is its ecosystem, not its GUI.

### The Simulink ecosystem advantages

- **Automatic C/C++ code generation** (Simulink Coder, Embedded Coder) — produces production-quality, certifiable code (DO-178C, IEC 61508, ISO 26262)
- **Hardware-in-the-loop (HIL) support** — direct integration with Speedgoat, dSPACE, National Instruments real-time targets
- **AUTOSAR toolchain** — direct model-to-AUTOSAR-component workflows for automotive
- **FMI/FMU** — Simulink can export Functional Mock-up Units for co-simulation (though OSS tools are catching up here)
- **Industry certifications** — many safety-critical projects *require* Simulink because it is the only DO-330-qualified code generator

### What open-source tools offer

- **OpenModelica** supports FMI export (FMU generation), which is a strong interoperability point. However, the FMU output quality has historically had issues with some model types.
- **Xcos** has limited code generation support. The Scilab scripting language is not widely used in industry.
- Neither tool has a certified code generation pathway that meets automotive or aerospace safety standards.

### The compounding effect

Even when the GUI issues are tolerable, the lack of ecosystem means companies cannot switch without replacing their entire downstream toolchain simultaneously. This is a switching cost that no amount of GUI improvement can eliminate in the short term.

### Design lesson

**FMI/FMU support is the interoperability key.** A new tool that can import and export FMUs can plug into existing Simulink-centric workflows as a component, rather than requiring a full replacement. Target FMI 3.0 compliance from day one. Additionally, design the model file format to be **git-friendly** (text-based, line-oriented diffs) — this alone is a significant advantage over Simulink's opaque `.slx` format.

---

## 12. Problem Category 10 — Documentation & Learning Curve

**Tools affected:** All open-source alternatives

### What happens

Simulink has decades of polished documentation, video tutorials, interactive examples, and a massive community of practitioners. Open-source tools have documentation that is incomplete, outdated, or assumes deep prior knowledge of the modeling language.

### Evidence from the field

From the OpenModelica community forum:

> *"It makes sense that OpenModelica (with all advanced features) has not gained popularity despite being open-source."*

The official OMEdit documentation describes how to open the tool and drag blocks, but leaves critical workflows (parameter editing in nested models, replaceable class selection, FMU export configuration) either undocumented or documented only in academic papers.

Xcos documentation has not kept pace with the tool's evolution. Many advanced blocks have no documentation beyond their name.

### The onboarding cliff

New users of Simulink can typically build a working PID controller simulation within 30 minutes of first launch, guided by MathWorks' interactive tutorials. The equivalent journey in OMEdit or Xcos typically involves:
1. Navigating an unintuitive library browser
2. Encountering a silent parameter-storage bug
3. Hitting a compilation error with no actionable message
4. Searching the forum and finding a 5-year-old thread that may or may not still apply

### Design lesson

**Documentation and onboarding are part of the product, not afterthoughts.** Ship with interactive, in-app tutorials (a "Getting Started" model that walks the user through building something real). Every block must have inline documentation accessible without leaving the canvas (tooltip + expandable panel). Error messages must be human-readable and actionable — *never* expose compiler stack traces to the user.

---

## 13. What Simulink Gets Right (And OSS Misses)

A consolidated view of Simulink's GUI/UX strengths that open-source tools have failed to replicate:

| Feature | Simulink | OpenModelica | Xcos |
|---|---|---|---|
| Canvas interaction latency | Instant | 5–6 sec on medium models | Moderate |
| GUI ↔ model sync | Reliable | Broken (data loss bugs) | Mostly OK |
| Wire auto-routing | Excellent (orthogonal) | Basic | Broken on save/load |
| Block search | Fuzzy, instant | Tree navigation only | Tree navigation only |
| Hierarchy drill-down | Full breadcrumb nav | Incomplete | Limited |
| Inline signal validation | Yes (pre-run check) | No (run-time only) | No |
| Parameter editing in nested models | Yes | Partially broken | Limited |
| Save/load fidelity | Reliable | Generally OK | Fragile on Windows |
| Cross-platform install | Reliable (with MATLAB) | Fragile | Crashes on W11/2024+ |
| Code generation | Certified (C/C++) | FMU only | Minimal |
| Documentation | Comprehensive | Incomplete | Minimal |
| Community & examples | Massive | Small academic | Small |

---

## 14. Summary: Design Lessons for a New Simulator Frontend

If you are building a new simulator frontend from scratch, the above analysis points to a clear set of architectural and UX decisions that would immediately differentiate it from existing open-source alternatives:

### Architecture

1. **Optimistic, decoupled canvas.** The visual editor maintains its own local state and never blocks on the solver. All solver interactions are asynchronous.

2. **Single source of truth.** One data model, rendered both visually and (optionally) textually. No round-trip data loss.

3. **Text-based, locale-independent file format.** JSON or TOML with integer canvas coordinates. Git-diffable. Roundtrip-tested in CI.

4. **FMI 3.0 support.** Export FMUs to plug into existing toolchains. Import FMUs as black-box blocks.

### Canvas & Interaction

5. **Orthogonal wire router.** All connections are horizontal/vertical segments. Deterministic. Stable across save/load. User-overridable.

6. **Inline port validation.** Type, dimension, and domain compatibility is checked on connection draw, not at run time. Visual feedback is immediate.

7. **Hierarchy navigation with breadcrumbs.** Double-click into any composite block. Navigate back with a breadcrumb bar. Changes propagate instantly.

### Discovery & Onboarding

8. **Search-first block library.** Fuzzy search is the primary interaction. Tree is secondary. Recently used blocks are surfaced.

9. **In-app documentation.** Every block has a tooltip and an expandable documentation panel. No external browser required.

10. **Interactive onboarding.** A built-in "Getting Started" example walks new users to a working simulation in under 10 minutes.

### Platform

11. **Zero install-time dependencies.** The editor works out of the box. No compiler, no runtime, no environment variable setup required.

12. **Human-readable error messages.** All errors are translated from compiler/solver output into actionable, user-facing language before display.

---

*Document compiled from: OpenModelica issue tracker, Scilab/Xcos mailing lists and community forums, GitHub issues, academic comparative studies, and engineering community discussions (Quora, ResearchGate). Sources current as of May 2026.*
