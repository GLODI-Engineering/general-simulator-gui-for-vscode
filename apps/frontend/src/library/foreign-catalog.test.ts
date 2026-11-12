import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { loadCatalog } from "./catalog-core";

/**
 * The front end must display faithfully whatever satisfies the contract —
 * not merely whatever gsim-core happens to send today.
 *
 * Every other catalogue test in this repo runs against the real
 * `engine-catalog.json`. That proves the app works with one supplier, which is
 * exactly what cannot be concluded from it: a gsim-core-specific assumption
 * could be baked into the loader and no test would notice, because no test has
 * ever shown the loader anything else.
 *
 * So these components come from no engine. They are invented — a hydraulic
 * valve, a six-port mixer, a block whose parameters are strings — and the
 * first test proves they are nonetheless *legal*, by validating them against
 * `block-metadata.schema.json`, the same contract the generator now enforces
 * on the engine's own submission. Everything after that asserts the app reads
 * them correctly.
 *
 * If a future change makes the loader depend on something only gsim-core does,
 * this file fails and says which component it choked on.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(
  readFileSync(
    resolve(HERE, "../../../../packages/schemas/definitions/blocks/block-metadata.schema.json"),
    "utf8",
  ),
);

/** A supplier that is not gsim-core, describing components that do not exist. */
const FOREIGN_COMPONENTS = [
  {
    name: "user.valve.proportional",
    type: "physical-electrical.valve.proportional",
    label: "Proportional Valve",
    category: "user",
    description: "A valve whose opening follows a control signal.",
    aliases: ["pvalve", "hyd.valve"],
    tags: ["user", "valve"],
    paradigm: "physical-network",
    domain: "physical-electrical",
    behavior: {
      causality: "acausal",
      // Note the vocabulary change: `behavior.domain` is an enum of
      // signal/electrical/thermal/mechanical/event/mixed, while the block's
      // own `domain` is signal/physical-electrical/physical-thermal/...
      // The contract carries two names for one concept. See the test below.
      domain: "electrical",
      equation_template: "user.valve.proportional",
      state_count: 1,
    },
    params: [
      { name: "k_v", label: "Flow coefficient", type: "number", default: 1.25, description: "" },
      { name: "mode", label: "Mode", type: "string", default: "linear", description: "" },
    ],
    ports: {
      inputs: [
        { id: "a", label: "A", kind: { domain: "physical-electrical" }, side: "left", offset: 10 },
      ],
      outputs: [
        { id: "b", label: "B", kind: { domain: "physical-electrical" }, side: "right", offset: 10 },
      ],
    },
    symbol: { bbox: [80, 48], shape: "rect", text: "PV" },
    fidelities: [{ tier: "ideal", doc: "Ideal valve.", params: [], ports: [] }],
    version: 1,
  },
  {
    name: "user.mixer.six_port",
    label: "Six-Port Mixer",
    category: "user",
    description: "Six inputs, two outputs, and a variadic tail.",
    aliases: [],
    tags: ["user"],
    paradigm: "signal-flow",
    domain: "signal",
    behavior: {
      causality: "causal",
      domain: "signal",
      equation_template: "user.mixer.six_port",
      state_count: 0,
    },
    params: [
      { name: "gain", label: "Gain", type: "number", default: 1, description: "" },
      { name: "n_aux", label: "Aux inputs", type: "integer", default: 0, description: "" },
    ],
    ports: {
      inputs: Array.from({ length: 6 }, (_, i) => ({
        id: `in${i + 1}`,
        label: `IN${i + 1}`,
        kind: { domain: "signal" },
        side: "left",
        offset: 8 * (i + 1),
      })),
      outputs: [
        { id: "sum", label: "Σ", kind: { domain: "signal" }, side: "right", offset: 20 },
        { id: "diff", label: "Δ", kind: { domain: "signal" }, side: "right", offset: 40 },
      ],
      variadic_inputs: {
        count_from: "n_aux",
        template: {
          id: "aux",
          label: "",
          kind: { domain: "signal", dims: "scalar" },
          side: "left",
          offset: 0,
        },
      },
    },
    symbol: { bbox: [120, 96], shape: "rect", text: "MIX" },
    fidelities: [{ tier: "ideal", doc: "Ideal mixer.", params: [], ports: [] }],
    version: 1,
  },
  {
    name: "user.block.bare",
    label: "Bare Block",
    category: "user",
    description: "No parameters, one port each way — the smallest legal component.",
    aliases: [],
    tags: [],
    paradigm: "signal-flow",
    domain: "signal",
    behavior: {
      causality: "causal",
      domain: "signal",
      equation_template: "user.block.bare",
      state_count: 0,
    },
    params: [],
    ports: {
      inputs: [{ id: "u", label: "u", kind: { domain: "signal" }, side: "left", offset: 20 }],
      outputs: [{ id: "y", label: "y", kind: { domain: "signal" }, side: "right", offset: 20 }],
    },
    symbol: { bbox: [60, 40], shape: "rect", text: "B" },
    fidelities: [{ tier: "ideal", doc: "Bare.", params: [], ports: [] }],
    version: 1,
  },
];

describe("a catalogue from a supplier that is not gsim-core", () => {
  it("is legal: every fixture satisfies the block-metadata contract", () => {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(SCHEMA);
    for (const component of FOREIGN_COMPONENTS) {
      const ok = validate(component);
      expect(
        ok,
        `${component.name} does not satisfy the contract: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  });

  it("loads without the loader ever having seen these components", () => {
    const catalog = loadCatalog(
      FOREIGN_COMPONENTS.map((metadata) => ({ filePath: `foreign/${metadata.name}`, metadata })),
    );
    for (const component of FOREIGN_COMPONENTS) {
      expect(catalog[component.name], `missing ${component.name}`).toBeDefined();
    }
  });

  it("keys a component by its name, its type and each alias", () => {
    const catalog = loadCatalog(FOREIGN_COMPONENTS.map((metadata) => ({ metadata })));
    const valve = catalog["user.valve.proportional"];
    expect(catalog["physical-electrical.valve.proportional"]).toBe(valve);
    // Aliases resolve here too. They did not until the catalogue and
    // `engine-types.ts` were made to agree: one resolved aliases and the other
    // did not, so an aliased sheet was reported compilable and then drew as an
    // unnamed box because no metadata could be found for it.
    expect(catalog.pvalve).toBe(valve);
    expect(catalog["hyd.valve"]).toBe(valve);
  });

  it("never lets an alias shadow another component's real name", () => {
    const squatter = {
      ...FOREIGN_COMPONENTS[2],
      name: "user.squatter",
      aliases: ["user.valve.proportional"],
      behavior: { ...FOREIGN_COMPONENTS[2].behavior, equation_template: "user.squatter" },
    };
    const catalog = loadCatalog(
      [squatter, ...FOREIGN_COMPONENTS].map((metadata) => ({ metadata })),
    );
    // The alias collides with a canonical name, so the canonical name wins
    // whatever order the entries arrived in.
    expect(catalog["user.valve.proportional"]?.name).toBe("user.valve.proportional");
  });

  it("keeps the label, category and symbol the supplier declared", () => {
    const catalog = loadCatalog(FOREIGN_COMPONENTS.map((metadata) => ({ metadata })));
    const mixer = catalog["user.mixer.six_port"];
    expect(mixer?.label).toBe("Six-Port Mixer");
    expect(mixer?.category).toBe("user");
    expect(mixer?.symbol?.bbox).toEqual([120, 96]);
  });

  it("keeps every port, including a six-input fan-in and a variadic tail", () => {
    const catalog = loadCatalog(FOREIGN_COMPONENTS.map((metadata) => ({ metadata })));
    const mixer = catalog["user.mixer.six_port"];
    expect(mixer?.ports.inputs.map((p) => p.id)).toEqual([
      "in1",
      "in2",
      "in3",
      "in4",
      "in5",
      "in6",
    ]);
    expect(mixer?.ports.outputs.map((p) => p.id)).toEqual(["sum", "diff"]);
    expect(mixer?.ports.variadic_inputs?.count_from).toBe("n_aux");
    expect(mixer?.ports.variadic_inputs?.template.id).toBe("aux");
  });

  it("keeps parameters and their defaults, including a non-numeric one", () => {
    const catalog = loadCatalog(FOREIGN_COMPONENTS.map((metadata) => ({ metadata })));
    const params = catalog["user.valve.proportional"]?.params ?? [];
    expect(params.map((p) => p.name)).toEqual(["k_v", "mode"]);
    expect(params.find((p) => p.name === "k_v")?.default).toBe(1.25);
    expect(params.find((p) => p.name === "mode")?.default).toBe("linear");
  });

  it("accepts a component with no parameters at all", () => {
    const catalog = loadCatalog(FOREIGN_COMPONENTS.map((metadata) => ({ metadata })));
    expect(catalog["user.block.bare"]?.params).toEqual([]);
    expect(catalog["user.block.bare"]?.ports.inputs).toHaveLength(1);
  });
});
