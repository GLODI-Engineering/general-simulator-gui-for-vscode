import { describe, expect, it } from "vitest";

import { derivePortsFor, parseCPorts, parseOctavePorts, parsePythonPorts } from "./code-ports";

/**
 * Ports are declared on the schematic and handed to the code, so the two can
 * disagree with nothing noticing. These read the source and say what it
 * looks like it expects.
 *
 * What each language can tell us differs, and that is the contract rather
 * than the parsing: Octave names both sides, Python names its inputs, and C
 * names neither.
 */
describe("parseOctavePorts — the complete case", () => {
  it("reads inputs and outputs by name", () => {
    const got = parseOctavePorts("function [y1, y2] = ctrl(u1, u2, u3)\n  y1 = u1;\nend");
    expect(got.inputs).toEqual(["u1", "u2", "u3"]);
    expect(got.outputs).toEqual(["y1", "y2"]);
  });

  it("reads a single unbracketed output", () => {
    const got = parseOctavePorts("function y = gain(u)\n  y = 2*u;\nend");
    expect(got.inputs).toEqual(["u"]);
    expect(got.outputs).toEqual(["y"]);
  });

  it("reads a function with no outputs", () => {
    const got = parseOctavePorts("function report(u)\n  disp(u);\nend");
    expect(got.inputs).toEqual(["u"]);
    expect(got.outputs).toEqual([]);
  });

  it("picks the named function when a file holds several", () => {
    const source = "function y = first(a)\nend\nfunction [p, q] = second(b, c)\nend";
    expect(parseOctavePorts(source, "second").inputs).toEqual(["b", "c"]);
    expect(parseOctavePorts(source, "second").outputs).toEqual(["p", "q"]);
  });

  it("takes the first function when none is named", () => {
    const source = "function y = first(a)\nend\nfunction [p] = second(b)\nend";
    expect(parseOctavePorts(source).inputs).toEqual(["a"]);
  });

  /** A commented-out signature must never be read as the real one. */
  it("ignores commented-out signatures", () => {
    const source = "% function [z] = old(q, r)\nfunction y = real_one(u)\nend";
    expect(parseOctavePorts(source).inputs).toEqual(["u"]);
    expect(parseOctavePorts(source).outputs).toEqual(["y"]);
  });

  it("says nothing about a file with no function", () => {
    expect(parseOctavePorts("x = 1 + 2;").inputs).toBeNull();
  });
});

describe("parsePythonPorts — inputs by name, outputs by count", () => {
  it("reads the argument names", () => {
    const got = parsePythonPorts("def ctrl(vref, vmeas):\n    return vref - vmeas\n");
    expect(got.inputs).toEqual(["vref", "vmeas"]);
  });

  it("counts a returned tuple", () => {
    const got = parsePythonPorts("def f(u):\n    return u, 2*u, 3*u\n");
    expect(got.outputs).toHaveLength(3);
  });

  it("does not mistake a comma inside a call for a second return value", () => {
    const got = parsePythonPorts("def f(u):\n    return max(u, 0)\n");
    expect(got.outputs).toHaveLength(1);
  });

  /** A guard clause returning early is normal; it just means we cannot tell. */
  it("claims nothing when the returns disagree", () => {
    const got = parsePythonPorts("def f(u):\n    if u < 0:\n        return 0\n    return u, u\n");
    expect(got.outputs).toBeNull();
  });

  /** `state`, `t`, `dt` are the block protocol's arguments, not signals. */
  it("drops the leading protocol arguments", () => {
    const got = parsePythonPorts("def output(state, t, dt, inputs):\n    return inputs\n");
    expect(got.inputs).toEqual(["inputs"]);
  });

  it("keeps a signal that merely happens to be called t", () => {
    const got = parsePythonPorts("def f(vin, t):\n    return vin\n");
    expect(got.inputs).toEqual(["vin", "t"]);
  });

  it("strips type annotations and defaults", () => {
    const got = parsePythonPorts("def f(a: float, b=2.0):\n    return a\n");
    expect(got.inputs).toEqual(["a", "b"]);
  });

  it("ignores commented-out definitions", () => {
    const got = parsePythonPorts("# def old(x, y, z):\ndef real_one(u):\n    return u\n");
    expect(got.inputs).toEqual(["u"]);
  });

  it("picks the named function", () => {
    const source = "def first(a):\n    return a\ndef second(b, c):\n    return b\n";
    expect(parsePythonPorts(source, "second").inputs).toEqual(["b", "c"]);
  });
});

/**
 * C declares no arity at all — `cscript_output` always has the same
 * signature — so it is read from how far the code indexes.
 */
describe("parseCPorts — inferred from indexing", () => {
  it("reads the highest index used on each side", () => {
    const source = `
      void cscript_output(void *state, const double *in, int in_len,
                          double dt, double *out, int out_len) {
        out[0] = in[0] + in[2];
        out[1] = in[1];
      }`;
    expect(parseCPorts(source).inputs).toHaveLength(3);
    expect(parseCPorts(source).outputs).toHaveLength(2);
  });

  it("handles a block that only reads inputs", () => {
    const got = parseCPorts("void f(const double *in) { double x = in[4]; }");
    expect(got.inputs).toHaveLength(5);
    expect(got.outputs).toBeNull();
  });

  it("ignores indices inside comments", () => {
    const source = "/* out[9] = in[9]; */ void f(void) { out[0] = in[1]; }";
    expect(parseCPorts(source).inputs).toHaveLength(2);
    expect(parseCPorts(source).outputs).toHaveLength(1);
  });

  it("ignores a line comment too", () => {
    const source = "// out[7] = in[7];\nvoid f(void) { out[0] = in[0]; }";
    expect(parseCPorts(source).outputs).toHaveLength(1);
  });

  /**
   * A computed index is invisible to a static read, and that is accepted:
   * the ask was to parse the source, not to interpret the program.
   */
  it("cannot see a computed index, and does not pretend to", () => {
    const got = parseCPorts("void f(void) { for (int i = 0; i < n; i++) out[i] = in[i]; }");
    expect(got.inputs).toBeNull();
  });

  it("says nothing about a file that indexes nothing", () => {
    expect(parseCPorts("int main(void) { return 0; }").inputs).toBeNull();
  });
});

describe("derivePortsFor picks by block type", () => {
  it("routes octave, python and c", () => {
    expect(derivePortsFor("extensibility.octfunc", "function y = f(u)\nend").inputs).toEqual(["u"]);
    expect(derivePortsFor("extensibility.pyfunc", "def f(a, b):\n    return a\n").inputs).toEqual([
      "a",
      "b",
    ]);
    expect(derivePortsFor("extensibility.cscript", "out[0]=in[1];").inputs).toHaveLength(2);
  });

  it("has nothing to say about a block that is not scripted", () => {
    expect(derivePortsFor("passive.resistor", "whatever").inputs).toBeNull();
  });
});
