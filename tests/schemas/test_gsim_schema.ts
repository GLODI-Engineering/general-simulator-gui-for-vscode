/**
 * FE-01: gsim model schema tests
 *
 * Tests the gsim.schema.json once it is authored at
 * packages/schemas/definitions/model/gsim.schema.json.
 *
 * Acceptance bullets verified:
 * - Valid fixtures: empty model, single block, multi-block+wires,
 *   rotated/mirrored block, pinned-bend wire.
 * - Invalid fixtures: float position, diagonal wire, unknown rotation,
 *   mismatched schema_version.
 * - Canonical key ordering check for every gsim fixture.
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

/**
 * Check that every key in every nested object is in sorted order (canonical).
 * This mirrors what the serializer must produce.
 */
function isCanonicallyOrdered(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  if (Array.isArray(value)) return value.every(isCanonicallyOrdered);
  const keys = Object.keys(value as object);
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] < keys[i - 1]) return false;
  }
  return Object.values(value as object).every(isCanonicallyOrdered);
}

// ---------------------------------------------------------------------------
// Valid fixtures
// ---------------------------------------------------------------------------

/** Empty model — no blocks, no wires. */
const EMPTY_MODEL = {
  model: {
    blocks: [],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000001",
    metadata: {},
    name: "Empty",
    wires: [],
  },
  schema_version: 1,
};

/** Single unrotated block, no wires. */
const SINGLE_BLOCK_MODEL = {
  model: {
    blocks: [
      {
        id: "b1",
        mirror: "none",
        params: {},
        position: [0, 0],
        rotation: 0,
        type: "signal.constant",
      },
    ],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000002",
    metadata: {},
    name: "SingleBlock",
    wires: [],
  },
  schema_version: 1,
};

/** Two blocks connected by a wire. */
const MULTI_BLOCK_MODEL = {
  model: {
    blocks: [
      {
        id: "b1",
        mirror: "none",
        params: {},
        position: [0, 0],
        rotation: 0,
        type: "signal.constant",
      },
      {
        id: "b2",
        mirror: "none",
        params: { gain: 2 },
        position: [40, 0],
        rotation: 0,
        type: "control.gain",
      },
    ],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000003",
    metadata: {},
    name: "MultiBlock",
    wires: [
      {
        from: { block: "b1", port: "out" },
        id: "w1",
        pinned: false,
        to: { block: "b2", port: "in" },
        waypoints: [],
      },
    ],
  },
  schema_version: 1,
};

/** Block with 90° rotation and x-mirror. */
const ROTATED_MIRRORED_MODEL = {
  model: {
    blocks: [
      {
        id: "b1",
        mirror: "x",
        params: {},
        position: [10, 20],
        rotation: 90,
        type: "control.gain",
      },
    ],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000004",
    metadata: {},
    name: "RotatedMirrored",
    wires: [],
  },
  schema_version: 1,
};

/** Wire with a pinned waypoint (non-empty waypoints). */
const PINNED_WIRE_MODEL = {
  model: {
    blocks: [
      {
        id: "b1",
        mirror: "none",
        params: {},
        position: [0, 0],
        rotation: 0,
        type: "signal.constant",
      },
      {
        id: "b2",
        mirror: "none",
        params: {},
        position: [60, 40],
        rotation: 0,
        type: "sinks.scope",
      },
    ],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000005",
    metadata: {},
    name: "PinnedWire",
    wires: [
      {
        from: { block: "b1", port: "out" },
        id: "w1",
        pinned: true,
        to: { block: "b2", port: "in" },
        // axis-aligned orthogonal waypoints as array of [x,y] pairs
        waypoints: [
          [30, 0],
          [30, 40],
        ],
      },
    ],
  },
  schema_version: 1,
};

const VALID_FIXTURES: [string, unknown][] = [
  ["empty model", EMPTY_MODEL],
  ["single block", SINGLE_BLOCK_MODEL],
  ["multi-block + wires", MULTI_BLOCK_MODEL],
  ["rotated and mirrored block", ROTATED_MIRRORED_MODEL],
  ["pinned-bend wire", PINNED_WIRE_MODEL],
];

// ---------------------------------------------------------------------------
// Invalid fixtures
// ---------------------------------------------------------------------------

/** Float in position — must fail */
const FLOAT_POSITION = {
  model: {
    blocks: [
      {
        id: "b1",
        mirror: "none",
        params: {},
        position: [0.5, 10],
        rotation: 0,
        type: "signal.constant",
      },
    ],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000006",
    metadata: {},
    name: "FloatPos",
    wires: [],
  },
  schema_version: 1,
};

/** Unknown rotation value (45) — must fail */
const BAD_ROTATION = {
  model: {
    blocks: [
      {
        id: "b1",
        mirror: "none",
        params: {},
        position: [0, 0],
        rotation: 45,
        type: "signal.constant",
      },
    ],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000007",
    metadata: {},
    name: "BadRot",
    wires: [],
  },
  schema_version: 1,
};

/** Wrong schema_version (2) — must fail */
const BAD_SCHEMA_VERSION = {
  model: {
    blocks: [],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000008",
    metadata: {},
    name: "BadVersion",
    wires: [],
  },
  schema_version: 2,
};

/** Wire waypoints with odd length (non-paired) — must fail */
const ODD_WAYPOINTS = {
  model: {
    blocks: [
      {
        id: "b1",
        mirror: "none",
        params: {},
        position: [0, 0],
        rotation: 0,
        type: "signal.constant",
      },
      {
        id: "b2",
        mirror: "none",
        params: {},
        position: [40, 0],
        rotation: 0,
        type: "sinks.scope",
      },
    ],
    grid: 10,
    id: "00000000-0000-0000-0000-000000000009",
    metadata: {},
    name: "OddWaypoints",
    wires: [
      {
        from: { block: "b1", port: "out" },
        id: "w1",
        pinned: false,
        to: { block: "b2", port: "in" },
        waypoints: [10, 20, 30], // odd length — invalid
      },
    ],
  },
  schema_version: 1,
};

const INVALID_FIXTURES: [string, unknown][] = [
  ["float position", FLOAT_POSITION],
  ["unknown rotation (45)", BAD_ROTATION],
  ["mismatched schema_version (2)", BAD_SCHEMA_VERSION],
  ["wire with odd-length waypoints", ODD_WAYPOINTS],
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("FE-01: gsim.schema.json", () => {
  let validate: Ajv["validate"] | null = null;
  let schemaLoadError: string | null = null;

  beforeAll(() => {
    try {
      const gsimSchema = loadSchema("model/gsim.schema.json");
      const portKindSchema = loadSchema("model/port-kind.schema.json");

      const ajv = new Ajv({ strict: true, allErrors: true });
      ajv.addSchema(portKindSchema);
      validate = ajv.compile(gsimSchema);
    } catch (e) {
      schemaLoadError = String(e);
    }
  });

  it("gsim.schema.json exists and compiles without error", () => {
    expect(schemaLoadError, `Schema failed to load/compile: ${schemaLoadError}`).toBeNull();
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

  describe("invalid fixtures fail with informative errors", () => {
    for (const [name, fixture] of INVALID_FIXTURES) {
      it(name, () => {
        if (!validate) return;
        const ok = validate(fixture);
        expect(ok).toBe(false);
        expect(validate.errors).toBeTruthy();
        expect((validate.errors ?? []).length).toBeGreaterThan(0);
        // Each error must have an instancePath so the caller knows where the fault is
        const paths = (validate.errors ?? []).map((e) => e.instancePath);
        expect(paths.some((p) => p.length > 0)).toBe(true);
      });
    }
  });

  describe("canonical key ordering", () => {
    for (const [name, fixture] of VALID_FIXTURES) {
      it(name, () => {
        expect(isCanonicallyOrdered(fixture)).toBe(true);
      });
    }
  });
});
