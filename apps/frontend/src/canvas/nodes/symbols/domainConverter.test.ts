import { describe, expect, it } from "vitest";

import { wireColorForDomain } from "../../edges/wire-color";
import { converterDrawing } from "./domainConverter";
import { findDrawing } from "./registry";

/**
 * All eleven converters used to fall back to the generic `shape: rect`, so
 * an electrical-to-thermal converter and a rotational-to-translational one
 * drew as the same blank box — and the `text:` in their metadata was never
 * rendered, so not even the abbreviation reached the sheet.
 */
const EVERY_CONVERTER = [
  "converter.sig2phys",
  "converter.phys2sig",
  "converter.signal_to_physical_signal",
  "converter.physical_signal_to_signal",
  "converter.electrical_to_rotational",
  "converter.rotational_to_electrical",
  "converter.electrical_to_thermal",
  "converter.electrical_to_translational",
  "converter.translational_to_electrical",
  "converter.rotational_to_translational",
  "converter.translational_to_rotational",
];

describe("domain converters", () => {
  it("every converter has artwork of its own", () => {
    for (const name of EVERY_CONVERTER) {
      expect(findDrawing(name), name).toBeDefined();
    }
  });

  it("a converter and its reverse are not the same drawing", () => {
    // The pair that motivated this: these differ only by direction, and a
    // reader must be able to tell which way round one is.
    expect(findDrawing("converter.electrical_to_rotational")).not.toBe(
      findDrawing("converter.rotational_to_electrical"),
    );
    expect(findDrawing("converter.sig2phys")).not.toBe(findDrawing("converter.phys2sig"));
  });

  it("takes its colours from the wire palette rather than copying them", () => {
    // A converter whose tag disagrees with the wire running into it is
    // worse than no tag at all, so these must not be able to drift apart.
    const drawing = converterDrawing("physical-electrical", "physical-thermal");
    const markup = JSON.stringify(drawing.draw({} as never));
    expect(markup).toContain(wireColorForDomain("physical-electrical"));
    expect(markup).toContain(wireColorForDomain("physical-thermal"));
  });

  it("gives thermal a tag that cannot be read as translational", () => {
    const thermal = JSON.stringify(
      converterDrawing("physical-electrical", "physical-thermal").draw({} as never),
    );
    const translational = JSON.stringify(
      converterDrawing("physical-electrical", "physical-translational").draw({} as never),
    );
    expect(thermal).not.toBe(translational);
  });
});
