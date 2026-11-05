/**
 * FE-51: gsim_sch v2 schema tests
 *
 * Tests packages/schemas/definitions/model/gsim_sch.schema.json
 * (JSON Schema 2020-12, strict, additionalProperties:false).
 *
 * Acceptance bullets verified:
 *   ✓ the canonical RC-low-pass example from spec §3–§13 validates
 *   ✓ schema_version=1 is rejected with a clear error
 *   ✓ a Block with float position is rejected
 *   ✓ a Block with mismatched paradigm/type-prefix is rejected
 *     (NOTE: JSON Schema 2020-12 validates each field independently via enum +
 *      pattern; cross-field paradigm/type-prefix consistency per spec §6.2 is
 *      enforced by the loader.  This test asserts rejection so that the coder-
 *      agent adds if/then constraints or delegates clearly to the loader.)
 *   ✓ a Wire whose endpoints have mismatched kinds is rejected
 *     (Wire.kind must be a valid PortKind enum.  Full endpoint-to-endpoint port-
 *      kind matching requires the block catalogue and is a loader constraint.
 *      This test covers the schema-level enum guard with an invalid kind string.)
 *   ✓ a Subsystem port missing boundary_block is rejected
 *   ✓ a Simulation.analyses entry of type TRAN missing t_end is rejected
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, "../../packages/schemas/definitions");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSchema(relPath: string): object {
  const full = resolve(SCHEMAS_DIR, relPath);
  return JSON.parse(readFileSync(full, "utf-8"));
}

// ---------------------------------------------------------------------------
// Canonical RC-low-pass fixture  (spec §3–§13)
// ---------------------------------------------------------------------------
//
// Topology: VDC v1 — R r1 — C c1 — GND gnd1
//
//   v1.p --[w1]--> r1.p
//   r1.n --[w2]--> c1.p   (waypoints: orthogonal L-bend)
//   c1.n --[w3]--> gnd1.p
//   v1.n --[w4]--> gnd1.p
//
// Named nets: vin (v1 positive), vout (r1/c1 node), GND (reference)
// Simulation: OP + TRAN

const RC_LOW_PASS_CANONICAL: unknown = {
  schema_version: 2,
  model: {
    id: "rc-low-pass",
    name: "RC Low-Pass Filter",
    grid: 10,
    params: [
      { name: "Rload", value: 1000, unit: "Ohm", doc: "Series resistor" },
      { name: "Cval", value: 1e-6, unit: "F", doc: "Shunt capacitor" },
      { name: "Tend", value: 5e-3, unit: "s" },
    ],
    blocks: [
      {
        id: "v1",
        type: "physical-electrical.source.voltage-dc",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [0, 100],
        rotation: 0,
        mirror: "none",
        params: { V: 5 },
        ic: {},
      },
      {
        id: "r1",
        type: "physical-electrical.passive.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [100, 0],
        rotation: 0,
        mirror: "none",
        params: { R: "Rload" },
        ic: {},
      },
      {
        id: "c1",
        type: "physical-electrical.passive.capacitor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [200, 100],
        rotation: 0,
        mirror: "none",
        params: { C: "Cval" },
        ic: { v: 0.0 },
      },
      {
        id: "gnd1",
        type: "physical-electrical.reference.ground",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "n_a",
        position: [100, 200],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      },
    ],
    wires: [
      {
        id: "w1",
        from: { block: "v1", port: "p" },
        to: { block: "r1", port: "p" },
        waypoints: [],
        pinned: false,
        net: "vin",
        kind: "physical-electrical",
      },
      {
        id: "w2",
        from: { block: "r1", port: "n" },
        to: { block: "c1", port: "p" },
        waypoints: [
          [150, 0],
          [150, 100],
        ],
        pinned: false,
        net: "vout",
        kind: "physical-electrical",
      },
      {
        id: "w3",
        from: { block: "c1", port: "n" },
        to: { block: "gnd1", port: "p" },
        waypoints: [],
        pinned: false,
        net: "GND",
        kind: "physical-electrical",
      },
      {
        id: "w4",
        from: { block: "v1", port: "n" },
        to: { block: "gnd1", port: "p" },
        waypoints: [],
        pinned: false,
        net: "GND",
        kind: "physical-electrical",
      },
    ],
    lines: [],
    nets: [
      { name: "vin", kind: "physical-electrical", scope: "local" },
      { name: "vout", kind: "physical-electrical", scope: "local" },
      { name: "GND", kind: "physical-electrical", scope: "global", is_reference: true },
    ],
    simulation: {
      default_analysis: "tr1",
      analyses: [
        { id: "op1", type: "OP" },
        { id: "tr1", type: "TRAN", t_end: "Tend", t_step: 1e-6 },
      ],
      solver: {
        abstol: 1e-12,
        reltol: 1e-3,
        vntol: 1e-6,
        method: "trap",
        method_options: {},
      },
      initial_conditions: [{ kind: "node", name: "vout", value: 0.0 }],
      output: {
        save_all_nodes: true,
        save_currents: ["v1"],
        save_block_states: [],
      },
    },
    metadata: {},
  },
};

// ---------------------------------------------------------------------------
// Additional valid fixtures
// ---------------------------------------------------------------------------

/** Minimal empty model — all arrays empty, simulation empty. */
const EMPTY_MODEL_V2: unknown = {
  schema_version: 2,
  model: {
    id: "empty-v2",
    name: "Empty v2",
    grid: 10,
    params: [],
    blocks: [],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/** Signal-flow model: constant → gain → scope. */
const SIGNAL_FLOW_MODEL: unknown = {
  schema_version: 2,
  model: {
    id: "gain-demo",
    name: "Gain Demo",
    grid: 10,
    params: [{ name: "K", value: 2.5 }],
    blocks: [
      {
        id: "src1",
        type: "signal-flow.source.constant",
        paradigm: "signal-flow",
        domain: "signal",
        fidelity: "n_a",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: { value: 1.0 },
        ic: {},
      },
      {
        id: "gain1",
        type: "signal-flow.math.gain",
        paradigm: "signal-flow",
        domain: "signal",
        fidelity: "n_a",
        position: [100, 0],
        rotation: 0,
        mirror: "none",
        params: { k: "K", mode: "element" },
        ic: {},
      },
      {
        id: "scope1",
        type: "signal-flow.sink.scope",
        paradigm: "signal-flow",
        domain: "signal",
        fidelity: "n_a",
        position: [200, 0],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      },
    ],
    wires: [
      {
        id: "w1",
        from: { block: "src1", port: "out" },
        to: { block: "gain1", port: "in" },
        waypoints: [],
        pinned: false,
        net: null,
        kind: "signal",
      },
      {
        id: "w2",
        from: { block: "gain1", port: "out" },
        to: { block: "scope1", port: "in0" },
        waypoints: [],
        pinned: false,
        net: null,
        kind: "signal",
      },
    ],
    lines: [],
    nets: [],
    simulation: {
      analyses: [{ id: "tr1", type: "TRAN", t_end: 10.0, t_step: 0.01 }],
    },
    metadata: {},
  },
};

/** Model with a subsystem block (depth 2). */
const SUBSYSTEM_MODEL: unknown = {
  schema_version: 2,
  model: {
    id: "with-subsys",
    name: "Model with subsystem",
    grid: 10,
    params: [{ name: "Kp", value: 1.0, doc: "Outer Kp" }],
    blocks: [
      {
        id: "ctrl1",
        type: "hierarchy.subsystem.atomic",
        paradigm: "hierarchy",
        domain: "mixed",
        fidelity: "n_a",
        position: [200, 100],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
        label: "Controller",
        subsystem: {
          id: "ctrl1-body",
          name: "Controller body",
          grid: 10,
          params: [{ name: "Kp", value: 1.0 }],
          blocks: [
            {
              id: "in-u",
              type: "hierarchy.inport",
              paradigm: "hierarchy",
              domain: "signal",
              fidelity: "n_a",
              position: [0, 0],
              rotation: 0,
              mirror: "none",
              params: {},
              ic: {},
            },
            {
              id: "out-y",
              type: "hierarchy.outport",
              paradigm: "hierarchy",
              domain: "signal",
              fidelity: "n_a",
              position: [200, 0],
              rotation: 0,
              mirror: "none",
              params: {},
              ic: {},
            },
          ],
          wires: [
            {
              id: "sw1",
              from: { block: "in-u", port: "out" },
              to: { block: "out-y", port: "in" },
              waypoints: [],
              pinned: false,
              net: null,
              kind: "signal",
            },
          ],
          lines: [],
          nets: [],
          simulation: {},
          metadata: {},
          ports: [
            { id: "u", direction: "in", kind: "signal", boundary_block: "in-u" },
            { id: "y", direction: "out", kind: "signal", boundary_block: "out-y" },
          ],
          parent_param_aliases: [{ child: "Kp", parent: "Kp" }],
        },
      },
    ],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/** Model with every annotation kind. */
const ANNOTATIONS_MODEL: unknown = {
  schema_version: 2,
  model: {
    id: "anno-demo",
    name: "Annotations demo",
    grid: 10,
    params: [],
    blocks: [],
    wires: [],
    lines: [
      {
        id: "a1",
        kind: "text",
        position: [10, 10],
        size: [200, 24],
        rotation: 0,
        text: "Filter stage 1",
        style: { color: "#333" },
      },
      {
        id: "a2",
        kind: "polyline",
        points: [
          [0, 0],
          [100, 0],
          [100, 50],
        ],
        style: { color: "#666", stroke_width: 1 },
      },
      {
        id: "a3",
        kind: "rectangle",
        position: [10, 10],
        size: [400, 200],
        style: { color: "#aaa", fill: "none" },
      },
      {
        id: "a4",
        kind: "ellipse",
        position: [100, 100],
        size: [80, 40],
        style: { color: "#a00", fill: "#fee" },
      },
    ],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

const VALID_FIXTURES: [string, unknown][] = [
  ["empty model v2", EMPTY_MODEL_V2],
  ["RC low-pass canonical example (spec §3–§13)", RC_LOW_PASS_CANONICAL],
  ["signal-flow model (constant → gain → scope)", SIGNAL_FLOW_MODEL],
  ["model with subsystem (depth 2)", SUBSYSTEM_MODEL],
  ["model with all four annotation kinds", ANNOTATIONS_MODEL],
];

// ---------------------------------------------------------------------------
// Invalid fixtures
// ---------------------------------------------------------------------------

/** schema_version=1 — must fail (const: 2). */
const SCHEMA_VERSION_1: unknown = {
  schema_version: 1,
  model: {
    id: "old-v1",
    name: "Old v1",
    grid: 10,
    params: [],
    blocks: [],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/** Block with float position — must fail (items: integer). */
const BLOCK_FLOAT_POSITION: unknown = {
  schema_version: 2,
  model: {
    id: "float-pos",
    name: "Float position",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "r1",
        type: "physical-electrical.passive.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [0.5, 10], // float — invalid
        rotation: 0,
        mirror: "none",
        params: { R: 1000 },
        ic: {},
      },
    ],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/**
 * Block with mismatched paradigm/type-prefix (spec §6.2).
 *
 * Type prefix is "signal-flow" but paradigm is "physical-network".
 * Per spec §6.2 the loader enforces consistency; this test documents the
 * requirement at the schema layer — the coder-agent must add if/then
 * constraints or confirm the check lives exclusively in the loader.
 */
const BLOCK_PARADIGM_TYPE_MISMATCH: unknown = {
  schema_version: 2,
  model: {
    id: "paradigm-mismatch",
    name: "Paradigm/type mismatch",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "g1",
        type: "signal-flow.math.gain", // "signal-flow" prefix
        paradigm: "physical-network", // mismatched — must be "signal-flow"
        domain: "signal",
        fidelity: "n_a",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: { k: 2 },
        ic: {},
      },
    ],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/**
 * Wire with an invalid (unknown) kind value.
 *
 * The schema validates wire.kind against the PortKind enum.  Full
 * endpoint-to-endpoint port-kind consistency (wire.kind matching both block
 * ports' actual kinds from the catalogue) is a loader-level constraint.
 */
const WIRE_INVALID_KIND: unknown = {
  schema_version: 2,
  model: {
    id: "wire-bad-kind",
    name: "Wire bad kind",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "v1",
        type: "physical-electrical.source.voltage-dc",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: { V: 5 },
        ic: {},
      },
      {
        id: "r1",
        type: "physical-electrical.passive.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [100, 0],
        rotation: 0,
        mirror: "none",
        params: { R: 1000 },
        ic: {},
      },
    ],
    wires: [
      {
        id: "w1",
        from: { block: "v1", port: "p" },
        to: { block: "r1", port: "p" },
        waypoints: [],
        pinned: false,
        net: null,
        kind: "optical-fiber", // not a valid PortKind — must fail
      },
    ],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/** Wire with float waypoints — must fail (IntegerPair items: integer). */
const WIRE_FLOAT_WAYPOINTS: unknown = {
  schema_version: 2,
  model: {
    id: "float-waypoints",
    name: "Float waypoints",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "v1",
        type: "physical-electrical.source.voltage-dc",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: { V: 5 },
        ic: {},
      },
      {
        id: "r1",
        type: "physical-electrical.passive.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [100, 0],
        rotation: 0,
        mirror: "none",
        params: { R: 1000 },
        ic: {},
      },
    ],
    wires: [
      {
        id: "w1",
        from: { block: "v1", port: "p" },
        to: { block: "r1", port: "p" },
        waypoints: [[10.5, 0]], // float waypoint — invalid
        pinned: false,
        net: null,
        kind: "physical-electrical",
      },
    ],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/**
 * Subsystem port with missing boundary_block — must fail.
 * SubsystemPort requires id, direction, kind, boundary_block.
 */
const SUBSYSTEM_PORT_MISSING_BOUNDARY_BLOCK: unknown = {
  schema_version: 2,
  model: {
    id: "sub-missing-boundary",
    name: "Sub port missing boundary_block",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "ctrl1",
        type: "hierarchy.subsystem.atomic",
        paradigm: "hierarchy",
        domain: "mixed",
        fidelity: "n_a",
        position: [100, 100],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
        subsystem: {
          id: "ctrl1-body",
          name: "Controller body",
          grid: 10,
          params: [],
          blocks: [],
          wires: [],
          lines: [],
          nets: [],
          simulation: {},
          metadata: {},
          ports: [
            {
              id: "u",
              direction: "in",
              kind: "signal",
              // boundary_block intentionally absent — must fail
            },
          ],
        },
      },
    ],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/**
 * TRAN analysis missing required t_end — must fail.
 * AnalysisTRAN requires id, type, t_end, t_step.
 */
const TRAN_MISSING_T_END: unknown = {
  schema_version: 2,
  model: {
    id: "tran-no-tend",
    name: "TRAN missing t_end",
    grid: 10,
    params: [],
    blocks: [],
    wires: [],
    lines: [],
    nets: [],
    simulation: {
      analyses: [
        {
          id: "tr1",
          type: "TRAN",
          // t_end intentionally missing — must fail
          t_step: 1e-6,
        },
      ],
    },
    metadata: {},
  },
};

/** Block missing required field `paradigm`. */
const BLOCK_MISSING_PARADIGM: unknown = {
  schema_version: 2,
  model: {
    id: "no-paradigm",
    name: "Block without paradigm",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "r1",
        type: "physical-electrical.passive.resistor",
        // paradigm missing — must fail
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: { R: 1000 },
        ic: {},
      },
    ],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/** Block with invalid fidelity value. */
const BLOCK_INVALID_FIDELITY: unknown = {
  schema_version: 2,
  model: {
    id: "bad-fidelity",
    name: "Bad fidelity",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "r1",
        type: "physical-electrical.passive.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ultra-precise", // not in enum
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: { R: 1000 },
        ic: {},
      },
    ],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/** Block with invalid rotation (45° — not in [0, 90, 180, 270]). */
const BLOCK_INVALID_ROTATION: unknown = {
  schema_version: 2,
  model: {
    id: "bad-rotation",
    name: "Bad rotation",
    grid: 10,
    params: [],
    blocks: [
      {
        id: "r1",
        type: "physical-electrical.passive.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [0, 0],
        rotation: 45, // not in enum [0, 90, 180, 270]
        mirror: "none",
        params: { R: 1000 },
        ic: {},
      },
    ],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

/** Top-level object missing required `model` key. */
const MISSING_MODEL_KEY: unknown = {
  schema_version: 2,
  // model is absent — must fail
};

/** schema_version=3 — beyond the declared const: 2. */
const SCHEMA_VERSION_3: unknown = {
  schema_version: 3,
  model: {
    id: "v3",
    name: "V3",
    grid: 10,
    params: [],
    blocks: [],
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  },
};

const INVALID_FIXTURES: [string, unknown][] = [
  ["schema_version=1 (wrong version — const 2)", SCHEMA_VERSION_1],
  ["schema_version=3 (wrong version — const 2)", SCHEMA_VERSION_3],
  ["Block with float position", BLOCK_FLOAT_POSITION],
  [
    "Block with mismatched paradigm/type-prefix (spec §6.2 — see comment above fixture)",
    BLOCK_PARADIGM_TYPE_MISMATCH,
  ],
  ["Wire with invalid kind (not in PortKind enum)", WIRE_INVALID_KIND],
  ["Wire with float waypoints", WIRE_FLOAT_WAYPOINTS],
  ["Subsystem port missing boundary_block", SUBSYSTEM_PORT_MISSING_BOUNDARY_BLOCK],
  ["TRAN analysis missing required t_end", TRAN_MISSING_T_END],
  ["Block missing required field paradigm", BLOCK_MISSING_PARADIGM],
  ["Block with invalid fidelity value", BLOCK_INVALID_FIDELITY],
  ["Block with invalid rotation (45°)", BLOCK_INVALID_ROTATION],
  ["Missing top-level model key", MISSING_MODEL_KEY],
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("FE-51: gsim_sch.schema.json", () => {
  let validate: Ajv["validate"] | null = null;
  let schemaLoadError: string | null = null;

  beforeAll(() => {
    try {
      const gsimSchSchema = loadSchema("model/gsim_sch.schema.json");
      const ajv = new Ajv({ strict: true, allErrors: true });
      validate = ajv.compile(gsimSchSchema);
    } catch (e) {
      schemaLoadError = String(e);
    }
  });

  it("gsim_sch.schema.json exists and compiles without error", () => {
    expect(schemaLoadError, `Schema failed to load or compile: ${schemaLoadError}`).toBeNull();
    expect(validate).not.toBeNull();
  });

  it("schema_version const is 2", () => {
    // Smoke: parse the schema and confirm const value.
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const props = raw.properties as Record<string, unknown>;
    const sv = props.schema_version as Record<string, unknown>;
    expect(sv.const).toBe(2);
  });

  describe("valid fixtures pass", () => {
    for (const [name, fixture] of VALID_FIXTURES) {
      it(name, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok, `Unexpected errors: ${JSON.stringify(validate.errors)}`).toBe(true);
      });
    }
  });

  describe("invalid fixtures are rejected", () => {
    for (const [name, fixture] of INVALID_FIXTURES) {
      it(name, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok, `Expected validation failure but schema accepted: ${name}`).toBe(false);
        expect(validate.errors, "Expected at least one validation error").toBeTruthy();
        expect(
          (validate.errors ?? []).length,
          "Expected at least one validation error",
        ).toBeGreaterThan(0);
      });
    }
  });

  // ── Targeted acceptance-bullet tests ────────────────────────────────────

  it("schema_version=1 produces a const-violation error", () => {
    if (!validate) return;
    validate(SCHEMA_VERSION_1);
    const errors = validate.errors ?? [];
    const constError = errors.find(
      (e) => e.keyword === "const" && e.instancePath === "/schema_version",
    );
    expect(
      constError,
      `Expected a 'const' error at /schema_version; got: ${JSON.stringify(errors)}`,
    ).toBeTruthy();
  });

  it("float position error points to /model/blocks/0/position/0", () => {
    if (!validate) return;
    validate(BLOCK_FLOAT_POSITION);
    const errors = validate.errors ?? [];
    const hasPositionError = errors.some(
      (e) => e.instancePath.includes("/position") && e.schema === "integer",
    );
    expect(
      hasPositionError,
      `Expected error touching position/integer; got: ${JSON.stringify(errors)}`,
    ).toBe(true);
  });

  it("TRAN missing t_end produces a 'required' error", () => {
    if (!validate) return;
    validate(TRAN_MISSING_T_END);
    const errors = validate.errors ?? [];
    const hasRequired = errors.some(
      (e) =>
        e.keyword === "required" &&
        e.params &&
        (e.params as Record<string, unknown>).missingProperty === "t_end",
    );
    // TRAN is discriminated via oneOf; the required error may appear at any path
    expect(
      errors.length,
      "Expected at least one validation error for missing t_end",
    ).toBeGreaterThan(0);
    // The missing property should be named in at least one error
    const mentionsTEnd = JSON.stringify(errors).includes("t_end");
    expect(
      mentionsTEnd || hasRequired,
      `Expected t_end to be named in errors; got: ${JSON.stringify(errors)}`,
    ).toBe(true);
  });

  it("subsystem port missing boundary_block produces a 'required' error", () => {
    if (!validate) return;
    validate(SUBSYSTEM_PORT_MISSING_BOUNDARY_BLOCK);
    const errors = validate.errors ?? [];
    const mentionsBoundaryBlock = JSON.stringify(errors).includes("boundary_block");
    expect(
      mentionsBoundaryBlock,
      `Expected 'boundary_block' to appear in errors; got: ${JSON.stringify(errors)}`,
    ).toBe(true);
  });

  it("Paradigm enum values are exactly the v2 set", () => {
    // Parse the schema and verify the Paradigm enum matches spec §6.
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const paradigm = defs.Paradigm as Record<string, unknown>;
    const enumValues: string[] = paradigm.enum as string[];
    expect(enumValues).toEqual(
      expect.arrayContaining([
        "signal-flow",
        "physical-network",
        "converter",
        "hierarchy",
        "routing",
        "annotation",
      ]),
    );
    expect(enumValues).toHaveLength(6);
  });

  it("Fidelity enum values are exactly the v2 set", () => {
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const fidelity = defs.Fidelity as Record<string, unknown>;
    const enumValues: string[] = fidelity.enum as string[];
    expect(enumValues).toEqual(expect.arrayContaining(["ideal", "behavioral", "spice", "n_a"]));
    expect(enumValues).toHaveLength(4);
  });

  it("Annotation kind enum covers text, polyline, rectangle, ellipse", () => {
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const annotation = defs.Annotation as Record<string, unknown>;
    const props = annotation.properties as Record<string, unknown>;
    const kindProp = props.kind as Record<string, unknown>;
    const enumValues: string[] = kindProp.enum as string[];
    expect(enumValues).toEqual(
      expect.arrayContaining(["text", "polyline", "rectangle", "ellipse"]),
    );
    expect(enumValues).toHaveLength(4);
  });

  it("Analysis type enum contains OP, TRAN, AC, DC, NOISE, TF", () => {
    // Collect all type const/enum values from Analysis sub-schemas.
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const reserved = defs.AnalysisReserved as Record<string, unknown>;
    const reservedProps = reserved.properties as Record<string, unknown>;
    const typeProp = reservedProps.type as Record<string, unknown>;
    expect(typeProp.enum).toEqual(expect.arrayContaining(["NOISE", "TF"]));
    // OP, TRAN, AC, DC should each be a separate sub-schema with a const type
    for (const name of ["AnalysisOP", "AnalysisTRAN", "AnalysisAC", "AnalysisDC"]) {
      const sub = defs[name] as Record<string, unknown>;
      const subProps = sub.properties as Record<string, unknown>;
      const subType = subProps.type as Record<string, unknown>;
      expect(subType.const, `Expected ${name}.type to have a const`).toBeTruthy();
    }
  });

  it("Block schema has additionalProperties:false", () => {
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const block = defs.Block as Record<string, unknown>;
    expect(block.additionalProperties).toBe(false);
  });

  it("Wire schema has additionalProperties:false", () => {
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const wire = defs.Wire as Record<string, unknown>;
    expect(wire.additionalProperties).toBe(false);
  });

  it("Model schema has additionalProperties:false", () => {
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const model = defs.Model as Record<string, unknown>;
    expect(model.additionalProperties).toBe(false);
  });

  it("SubsystemPort schema has additionalProperties:false and requires boundary_block", () => {
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const port = defs.SubsystemPort as Record<string, unknown>;
    expect(port.additionalProperties).toBe(false);
    expect(port.required).toContain("boundary_block");
  });

  it("Wire.kind is in the PortKind inline enum in the schema", () => {
    const raw = loadSchema("model/gsim_sch.schema.json") as Record<string, unknown>;
    const defs = raw.$defs as Record<string, unknown>;
    const portKind = defs.PortKind as Record<string, unknown>;
    const enumValues: string[] = portKind.enum as string[];
    expect(enumValues).toEqual(
      expect.arrayContaining([
        "signal",
        "signal-bus",
        "function-call",
        "physical-electrical",
        "physical-translational",
        "physical-rotational",
        "physical-thermal",
        "physical-signal",
        "mixed",
        "reserved.physical-magnetic",
        "reserved.physical-hydraulic",
        "reserved.physical-fluid",
      ]),
    );
    expect(enumValues).toHaveLength(12);
  });
});
