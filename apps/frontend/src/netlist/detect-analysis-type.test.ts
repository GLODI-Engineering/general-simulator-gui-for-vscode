import { describe, expect, it } from "vitest";
import { detectAnalysisTypeFromNetlist } from "./generate";

describe("detectAnalysisTypeFromNetlist", () => {
  it("detects a top-level .tran card", () => {
    const netlist = "V1 in 0 DC 5\nR1 in out 1k\nC1 out 0 1u\n.TRAN 10u 5m\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("TRAN");
  });

  it("detects a top-level .ac card", () => {
    const netlist = "V1 in 0 DC 0 AC 1\nR1 in out 1k\nC1 out 0 1u\n.AC DEC 10 1k 10MEG\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("AC");
  });

  it("detects a top-level .dc card", () => {
    const netlist = "M1 d g s b nch\n.DC vds 0 3.5 0.05\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("DC");
  });

  it("detects a top-level .noise card", () => {
    const netlist = "Q1 3 2 0 test\n.noise v(3) vin dec 10 1k 100Meg 1\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("NOISE");
  });

  it("detects a top-level .op card", () => {
    const netlist = "V1 in 0 5\nR1 in 0 1k\n.OP\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("OP");
  });

  it("is case-insensitive and ignores leading whitespace", () => {
    const netlist = "V1 in 0 5\n  .ac dec 10 1 1meg\n.end\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("AC");
  });

  it("ignores comment lines", () => {
    const netlist =
      "* .ac dec 10 1 1meg  (this is a comment, not a real card)\n.TRAN 1u 1m\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("TRAN");
  });

  it("falls back to TRAN when no recognized analysis card is present", () => {
    const netlist = "V1 in 0 5\nR1 in 0 1k\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("TRAN");
  });

  it("picks the first analysis card when multiple are present", () => {
    const netlist = ".ac dec 10 1 1meg\n.dc vin -1 1 0.1\n.tran 1u 1m\n.END\n";
    expect(detectAnalysisTypeFromNetlist(netlist)).toBe("AC");
  });
});
