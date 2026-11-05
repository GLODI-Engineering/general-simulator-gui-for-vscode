# Unified Cross-Simulator CAD Manifest Guide

This document explains the unified manifest:

- `Misc/spice-simulator-analsys/SPICE-CAD-LIBRARY-MANIFEST.yaml`
- `Misc/spice-simulator-analsys/SPICE-CAD-LIBRARY-MANIFEST.json`

It combines the simulator-specific manifests for **ngspice** and **Xyce** into one portability-focused data model.

---

## 1) Purpose

The unified manifest is the **single integration layer** for CAD tooling that must:

1. load symbol/device metadata for multiple SPICE-family simulators,
2. preserve simulator-specific details,
3. map common designators (`R`, `C`, `M`, `Q`, etc.) across simulators,
4. support import/export and compatibility diagnostics.

Use this manifest when building cross-simulator features (shared symbol libraries, conversion tools, validation).

---

## 2) File structure (top-level)

Top-level keys:

- `manifest_version`: schema revision
- `created_at`: generation date
- `project`: repository/project name
- `scope`: expected value `cross-simulator-cad-library`
- `simulators`: list of included simulators (currently `ngspice`, `xyce`)
- `sources`: source manifests used to build this unified file
- `per_simulator`: full embedded simulator-specific manifests
- `crosswalk`: shared mapping metadata

---

## 3) `per_simulator` section

`per_simulator` is the source of truth for simulator behavior.

Currently includes:

- `per_simulator.ngspice` = full ngspice manifest
- `per_simulator.xyce` = full Xyce manifest

Each keeps its native fields (device classes, model families, digital/TCAD specifics, generation rules).

**Important:** when there is any ambiguity, prefer the simulator-specific branch over any inferred crosswalk behavior.

---

## 4) `crosswalk.designator_map`

`crosswalk.designator_map` aligns designators across simulators.

Structure concept:

```yaml
crosswalk:
  designator_map:
    R:
      ngspice: { ... }
      xyce:    { ... }
    M:
      ngspice: { ... }
      xyce:    { ... }
```

For each designator, per-simulator entries include compact metadata:

- `id`
- `name`
- `class`
- `ports` (or model-defined marker)
- `model_required`

This is intended for:

- quick compatibility checks,
- converter routing,
- UI hints (e.g., “designator exists in both simulators but semantics differ”).

---

## 5) Recommended usage patterns

### A. Symbol generation

1. Choose simulator context (`ngspice` or `xyce`).
2. Read `per_simulator.<simulator>`.
3. Generate symbols from simulator-specific definitions.
4. Use `crosswalk` only for optional portability hints.

### B. Netlist conversion

1. Parse source designator.
2. Lookup in `crosswalk.designator_map`.
3. If target simulator entry is missing, report unsupported mapping.
4. If present, apply target simulator template from `per_simulator.<target>`.

### C. Validation/diagnostics

- “Exists in source simulator but not in target simulator”
- “Same designator, different control semantics” (e.g., control-by-reference vs explicit control pins)
- “Model required in target but optional in source”

---

## 6) Known cross-simulator caveats

1. **Same designator, different semantics**
   - Example: `U` is XSPICE-centric in ngspice; Xyce `U` is behavioral digital device syntax.
2. **Reference-driven controls**
   - `F/H/W/K`-style elements may require metadata links rather than extra schematic pins.
3. **Model-level richness differs**
   - Especially for MOS/BJT level families and TCAD support.
4. **Legacy/deprecated support differs**
   - Xyce Y-type digital devices are deprecated but still represented for compatibility.

---

## 7) Extension rules

When adding a new simulator (e.g., ngspice+xyce+third):

1. Create simulator-specific manifest first.
2. Embed it under `per_simulator.<new_sim>`.
3. Add simulator name to `simulators`.
4. Extend `crosswalk.designator_map` with `<new_sim>` entries.
5. Do not remove simulator-specific fields just to normalize shape.

---

## 8) Companion files

- `Misc/spice-simulator-analsys/NGSPICE-CAD-LIBRARY-MANIFEST.yaml`
- `Misc/spice-simulator-analsys/NGSPICE-CAD-LIBRARY-MANIFEST.json`
- `Misc/spice-simulator-analsys/XYCE-CAD-LIBRARY-MANIFEST.yaml`
- `Misc/spice-simulator-analsys/XYCE-CAD-LIBRARY-MANIFEST.json`

Human-readable analysis docs:

- `docs/spice-simulator-analsys/NGSPICE-COMPONENT-CATALOG.md`
- `docs/spice-simulator-analsys/NGSPICE-XSPICE-MODEL-CATALOG.md`
- `docs/spice-simulator-analsys/XYCE-COMPONENT-CATALOG.md`
- `docs/spice-simulator-analsys/COMPONENT-PARAMETERIZATION-BY-NATURE.md`

---

## 9) Practical recommendation

Treat the unified manifest as a **federated index**:

- Use `per_simulator` for implementation correctness.
- Use `crosswalk` for portability UX and conversion planning.

That approach avoids flattening away simulator-specific behavior while still enabling cross-simulator tooling.
