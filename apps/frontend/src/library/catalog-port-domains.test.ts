import { describe, expect, it } from "vitest";

import manifest from "./catalog-manifest.json";

/**
 * Every value `PortKindDomain` admits.
 * Source: `packages/schemas/generated/typescript/block-metadata.schema.d.ts`.
 */
const VALID_PORT_DOMAINS = new Set([
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
]);

type Entry = {
  metadata: {
    name: string;
    ports?: {
      inputs?: Array<{ id: string; kind?: { domain?: string } }>;
      outputs?: Array<{ id: string; kind?: { domain?: string } }>;
    };
  };
};

const entries = manifest as unknown as Entry[];

/**
 * A port domain outside the union is not a type error anywhere — the metadata
 * is YAML, read at build time — so an invalid value simply flows through to
 * the canvas and misbehaves quietly.
 *
 * It did. 136 port declarations across 55 block metadata files said
 * `electrical`, which is `behavior.domain`'s enum, not a port's. The two
 * fields are both spelled `domain` and sit a few lines apart in the same
 * file. Nothing rejected it: roughly a fifth of all electrical parts drew
 * their wires in the unknown-domain grey instead of the electrical colour,
 * and port-compatibility checks could not match them against the parts that
 * spelled it correctly.
 */
describe("catalog port domains", () => {
  it("only uses domains the PortKindDomain union admits", () => {
    const offenders: string[] = [];
    for (const entry of entries) {
      const { name, ports } = entry.metadata;
      for (const port of [...(ports?.inputs ?? []), ...(ports?.outputs ?? [])]) {
        const domain = port.kind?.domain;
        if (domain !== undefined && !VALID_PORT_DOMAINS.has(domain)) {
          offenders.push(`${name}.${port.id} -> ${domain}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never uses the behavior-domain spelling on a port", () => {
    // The specific confusion that caused this: `electrical`, `mechanical` and
    // `event` are behaviour domains. A port is `physical-electrical`.
    const behaviourOnly = new Set(["electrical", "mechanical", "event", "thermal"]);
    const offenders: string[] = [];
    for (const entry of entries) {
      const { name, ports } = entry.metadata;
      for (const port of [...(ports?.inputs ?? []), ...(ports?.outputs ?? [])]) {
        const domain = port.kind?.domain;
        if (domain !== undefined && behaviourOnly.has(domain)) {
          offenders.push(`${name}.${port.id} -> ${domain}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("covers a meaningful share of the catalog", () => {
    // Guards the guard: if the manifest ever loads empty, the assertions
    // above pass vacuously.
    const withPorts = entries.filter(
      (e) => (e.metadata.ports?.inputs?.length ?? 0) + (e.metadata.ports?.outputs?.length ?? 0) > 0,
    );
    expect(withPorts.length).toBeGreaterThan(200);
  });
});
