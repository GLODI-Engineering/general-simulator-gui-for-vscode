/**
 * What may be wired to what — exercised by dragging, not by asking the
 * compatibility function.
 *
 * `port-compat.ts` has unit tests and they pass. They prove the rule is
 * implemented; they cannot prove the canvas consults it, that a refusal
 * actually leaves no wire behind, or that a terminal can be hit at all.
 * Everything below goes through a real drag between two real terminals.
 *
 * The representatives come from the catalog manifest at run time, so this
 * keeps covering the domains the build actually has rather than the ones
 * that existed when it was written.
 */

import { portDomains, representativeFor } from "./actions/catalog";
import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

const DOMAINS = portDomains().filter((d) => d !== "unknown");

function pair(domain: string) {
  const source = representativeFor(domain, { as: "source" });
  const sink = representativeFor(domain, { as: "sink" });
  return source && sink ? { source, sink } : null;
}

test.describe("same domain", () => {
  for (const domain of DOMAINS) {
    test(`${domain} connects to ${domain}`, async ({ appPage }) => {
      const chosen = pair(domain);
      test.skip(!chosen, `no source/sink pair in the catalog for ${domain}`);
      if (!chosen) return;

      const sheet = new SchematicPage(appPage);
      const [from, to] = await sheet.insertPairApart(
        chosen.source.component.type,
        chosen.sink.component.type,
      );

      const wire = await sheet.wire(
        { block: from, port: chosen.source.port.id },
        { block: to, port: chosen.sink.port.id },
      );
      expect(wire.kind).toBe(domain);
    });
  }
});

test.describe("different domains", () => {
  // One test per source domain, looping over the rest: 42 separate tests
  // would spend most of their time booting a page.
  for (const from of DOMAINS) {
    test(`${from} refuses every other domain`, async ({ appPage }) => {
      test.setTimeout(180_000);
      const source = representativeFor(from, { as: "source" });
      test.skip(!source, `no source in the catalog for ${from}`);
      if (!source) return;

      const sheet = new SchematicPage(appPage);
      const wronglyAccepted: string[] = [];

      for (const to of DOMAINS) {
        if (to === from) continue;
        const sink = representativeFor(to, { as: "sink" });
        if (!sink) continue;

        await sheet.clearSheet();
        const [a, b] = await sheet.insertPairApart(source.component.type, sink.component.type);

        const before = await sheet.wireCount();
        await sheet.drawWire({ block: a, port: source.port.id }, { block: b, port: sink.port.id });
        if ((await sheet.wireCount()) !== before) {
          wronglyAccepted.push(
            `${from}:${source.component.type}.${source.port.id} -> ` +
              `${to}:${sink.component.type}.${sink.port.id}`,
          );
        }
      }

      expect(
        wronglyAccepted,
        "these cross-domain connections were accepted and should not have been:\n" +
          wronglyAccepted.join("\n"),
      ).toEqual([]);
    });
  }
});

test.describe("converters are how domains meet", () => {
  test("a signal drives an electrical node through sig2phys", async ({ appPage }) => {
    // The engine enforces this shape: a switch gate driven straight from a
    // signal source fails with GateTargetNotSig2Voltage. The canvas should
    // make the legal shape drawable and the illegal one not.
    const sheet = new SchematicPage(appPage);

    const gain = await sheet.add("control.gain", 0.12, 0.3);
    const converter = await sheet.add("converter.sig2phys", 0.5, 0.3);
    const ground = await sheet.add("routing.ground", 0.85, 0.65);

    const signalSide = await sheet.wire(
      { block: gain, port: "out" },
      { block: converter, port: "in" },
    );
    expect(signalSide.kind).toBe("signal");

    const electricalSide = await sheet.wire(
      { block: converter, port: "out" },
      { block: ground, port: "gnd" },
    );
    expect(electricalSide.kind).toBe("physical-electrical");
  });

  test("the same signal cannot reach the electrical node directly", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const gain = await sheet.add("control.gain", 0.15, 0.35);
    const ground = await sheet.add("routing.ground", 0.8, 0.6);

    await sheet.expectWireRefused({ block: gain, port: "out" }, { block: ground, port: "gnd" });
  });
});

test.describe("fan-in", () => {
  test("an electrical node takes as many wires as you like", async ({ appPage }) => {
    // Acausal: a node has a voltage across it and a current through it,
    // solved together. Three things meeting at one node is a circuit, not
    // a conflict.
    const sheet = new SchematicPage(appPage);
    const r1 = await sheet.add("passive.resistor", 0.15, 0.2);
    const r2 = await sheet.add("passive.resistor", 0.15, 0.7);
    const ground = await sheet.add("routing.ground", 0.75, 0.45);

    await sheet.wire({ block: r1, port: "n" }, { block: ground, port: "gnd" });
    await sheet.wire({ block: r2, port: "n" }, { block: ground, port: "gnd" });

    expect(await sheet.wireCount()).toBe(2);
  });

  test("a signal input takes exactly one", async ({ appPage }) => {
    // A signal goes from the block that computes it to the blocks that read
    // it. Two drivers on one input is not a circuit, it is a contradiction.
    const sheet = new SchematicPage(appPage);
    const a = await sheet.add("control.gain", 0.12, 0.2);
    const b = await sheet.add("control.gain", 0.12, 0.72);
    const sink = await sheet.add("hierarchy.outport", 0.8, 0.45);

    await sheet.wire({ block: a, port: "out" }, { block: sink, port: "in" });
    await sheet.expectWireRefused({ block: b, port: "out" }, { block: sink, port: "in" });
  });
});
