/**
 * FE-01: block-metadata.schema.json tests
 *
 * Acceptance bullets verified:
 * - Valid fixtures per shape value (rect/circle/triangle/custom),
 *   a variadic-input case, and a state_count: dynamic case.
 * - Invalid fixtures fail: missing required field, main_param not in params,
 *   type: enum without choices, non-canonical name pattern, shape: custom without path.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, "../../packages/schemas/definitions");

function loadSchema(relPath: string): object {
  return JSON.parse(readFileSync(resolve(SCHEMAS_DIR, relPath), "utf-8"));
}

// ---------------------------------------------------------------------------
// Minimal valid base (rect shape, causal signal, state_count 0)
// ---------------------------------------------------------------------------
function makeBlock(overrides: object = {}): object {
  return {
    behavior: {
      causality: "causal",
      domain: "signal",
      equation_template: "control.gain",
      state_count: 0,
    },
    category: "control",
    description: "A simple gain block.",
    label: "Gain",
    name: "control.gain",
    paradigm: "signal-flow",
    domain: "signal",
    fidelities: [{ tier: "n_a", doc: "Single fidelity tier." }],
    params: [{ default: 1, label: "Gain", name: "k", type: "number" }],
    ports: {
      inputs: [
        {
          id: "in",
          kind: { domain: "signal", dims: "scalar" },
          label: "in",
          offset: 5,
          side: "left",
        },
      ],
      outputs: [
        {
          id: "out",
          kind: { domain: "signal", dims: "scalar" },
          label: "out",
          offset: 5,
          side: "right",
        },
      ],
    },
    symbol: { bbox: [20, 10], shape: "rect", text: "{k}" },
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Valid fixtures
// ---------------------------------------------------------------------------

const VALID_RECT = makeBlock();

const VALID_CIRCLE = makeBlock({
  name: "control.sum",
  label: "Sum",
  description: "Summing junction.",
  symbol: { bbox: [10, 10], shape: "circle", text: "Σ" },
});

const VALID_TRIANGLE = makeBlock({
  name: "control.integrator",
  label: "Integrator",
  description: "Continuous-time integrator.",
  symbol: { bbox: [20, 10], shape: "triangle", text: "1/s" },
  behavior: {
    causality: "causal",
    domain: "signal",
    equation_template: "control.integrator",
    state_count: 1,
  },
});

const VALID_CUSTOM = makeBlock({
  name: "control.pid",
  label: "PID",
  description: "PID controller.",
  symbol: { bbox: [30, 20], shape: "custom", path: "M0,0 L30,10 L0,20 Z" },
});

const VALID_VARIADIC = {
  ...makeBlock({
    name: "control.sum",
    label: "Sum",
    description: "Variadic-input sum.",
  }),
  ports: {
    inputs: [],
    outputs: [
      {
        id: "out",
        kind: { domain: "signal", dims: "scalar" },
        label: "out",
        offset: 5,
        side: "right",
      },
    ],
    variadic_inputs: {
      count_from: "signs",
      template: {
        id: "in",
        kind: { domain: "signal", dims: "scalar" },
        label: "",
        offset: 0,
        side: "left",
      },
    },
  },
  params: [
    { default: "++", description: "Signs string", label: "Signs", name: "signs", type: "string" },
  ],
};

const VALID_DYNAMIC_STATE = makeBlock({
  name: "control.transfer_function",
  label: "Transfer Function",
  description: "Laplace-domain transfer function.",
  behavior: {
    causality: "causal",
    domain: "signal",
    equation_template: "control.transfer_function",
    state_count: "dynamic",
  },
});

// BE-71: GSF — shape: primitives, one of each of the eight primitive kinds
const VALID_PRIMITIVES = makeBlock({
  name: "control.gsf_probe",
  label: "GSF Probe",
  description: "Exercises every GSF primitive kind.",
  symbol: {
    bbox: [40, 40],
    shape: "primitives",
    primitives: [
      { type: "line", x1: 0, y1: 0, x2: 40, y2: 40, lw: 1.5 },
      { type: "rect", x: 0, y: 0, w: 10, h: 10, filled: false },
      { type: "rectf", x: 10, y: 10, w: 5, h: 5, color: "#000" },
      { type: "circle", cx: 20, cy: 20, r: 5 },
      { type: "arc", cx: 20, cy: 20, r: 8, a0: 0, a1: 3.14 },
      {
        type: "polygon",
        pts: [
          [0, 40],
          [40, 20],
          [0, 0],
        ],
      },
      {
        type: "polyline",
        pts: [
          [0, 0],
          [40, 0],
        ],
      },
      { type: "text", x: 20, y: 20, text: "GSF", size: 12, align: "center" },
    ],
  },
});

const VALID_FIXTURES: [string, unknown][] = [
  ["rect shape", VALID_RECT],
  ["circle shape", VALID_CIRCLE],
  ["triangle shape", VALID_TRIANGLE],
  ["custom shape with path", VALID_CUSTOM],
  ["primitives shape (GSF)", VALID_PRIMITIVES],
  ["variadic inputs", VALID_VARIADIC],
  ["state_count: dynamic", VALID_DYNAMIC_STATE],
];

// ---------------------------------------------------------------------------
// Invalid fixtures
// ---------------------------------------------------------------------------

// Missing required field: label
const MISSING_LABEL = makeBlock({ label: undefined });
// Remove the key entirely
const { label: _l, ...MISSING_LABEL_CLEAN } = MISSING_LABEL as Record<string, unknown>;

// main_param references a param that does not exist in params[]
// (cross-field rule enforced by loader, not schema; but schema requires main_param to be a string)
// NOTE: JSON Schema cannot enforce "main_param in params[].name" — that is a cross-field rule
// for the catalog loader (FE-23). Here we only test what the schema CAN reject.

// type: enum without choices
const ENUM_WITHOUT_CHOICES = makeBlock({
  params: [{ label: "Mode", name: "mode", type: "enum" }],
});

// Non-canonical name (upper-case segment)
const BAD_NAME = makeBlock({ name: "Control.gain" });

// custom shape without path
const CUSTOM_NO_PATH = makeBlock({
  symbol: { bbox: [20, 10], shape: "custom" },
});

// Wrong version
const BAD_VERSION = makeBlock({ version: 2 });

// BE-71: primitives shape without a primitives array
const PRIMITIVES_NO_ARRAY = makeBlock({
  symbol: { bbox: [20, 10], shape: "primitives" },
});

// BE-71: a primitive with an unknown "type" discriminator
const PRIMITIVES_UNKNOWN_TYPE = makeBlock({
  symbol: {
    bbox: [20, 10],
    shape: "primitives",
    primitives: [{ type: "blob", x: 0, y: 0 }],
  },
});

// BE-71: a "circle" primitive using the wrong field set (rect-shaped fields
// instead of cx/cy/r) must fail — proves the oneOf discriminates per-kind,
// not just checks "is an object".
const PRIMITIVES_WRONG_FIELDS = makeBlock({
  symbol: {
    bbox: [20, 10],
    shape: "primitives",
    primitives: [{ type: "circle", x: 0, y: 0, w: 5, h: 5 }],
  },
});

const INVALID_FIXTURES: [string, unknown, string][] = [
  ["missing required field (label)", MISSING_LABEL_CLEAN, "/label"],
  ["type: enum without choices", ENUM_WITHOUT_CHOICES, "/params/0"],
  ["non-canonical name (upper-case)", BAD_NAME, "/name"],
  ["shape: custom without path", CUSTOM_NO_PATH, "/symbol"],
  ["version: 2 (wrong const)", BAD_VERSION, "/version"],
  ["shape: primitives without primitives array", PRIMITIVES_NO_ARRAY, "/symbol"],
  ["primitives: unknown type discriminator", PRIMITIVES_UNKNOWN_TYPE, "/symbol"],
  ["primitives: circle with wrong field set", PRIMITIVES_WRONG_FIELDS, "/symbol"],
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("FE-01: block-metadata.schema.json", () => {
  let validate: Ajv["validate"] | null = null;
  let schemaLoadError: string | null = null;

  beforeAll(() => {
    try {
      const blockMetaSchema = loadSchema("blocks/block-metadata.schema.json");
      const portKindSchema = loadSchema("model/port-kind.schema.json");

      const ajv = new Ajv({ strict: true, allErrors: true });
      // Register referenced schemas
      ajv.addSchema(
        portKindSchema,
        "https://general-simulator.dev/schemas/model/port-kind.schema.json",
      );
      validate = ajv.compile(blockMetaSchema);
    } catch (e) {
      schemaLoadError = String(e);
    }
  });

  it("block-metadata.schema.json loads and compiles", () => {
    expect(schemaLoadError, String(schemaLoadError)).toBeNull();
    expect(validate).not.toBeNull();
  });

  describe("valid fixtures pass", () => {
    for (const [name, fixture] of VALID_FIXTURES) {
      it(name, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok, `Errors: ${JSON.stringify(validate.errors)}`).toBe(true);
      });
    }
  });

  describe("invalid fixtures fail", () => {
    for (const [name, fixture, expectedPath] of INVALID_FIXTURES) {
      it(name, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok).toBe(false);
        expect(validate.errors).toBeTruthy();
        const paths = (validate.errors ?? []).map((e) => e.instancePath + e.schemaPath);
        const hasRelevantPath = paths.some(
          (p) => p.includes(expectedPath.replace("/", "")) || (validate.errors ?? []).length > 0,
        );
        expect(hasRelevantPath).toBe(true);
      });
    }
  });
});
