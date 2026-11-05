import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FE-63 fixture validity", () => {
  it("comprehensive.gsim_sch parses as JSON and has schema_version=2", () => {
    const p = resolve(process.cwd(), "tests/fixtures/gsim_sch/comprehensive.gsim_sch");
    const doc = JSON.parse(readFileSync(p, "utf-8"));
    expect(doc.schema_version).toBe(2);
    expect(doc.model).toBeTruthy();
  });
});
