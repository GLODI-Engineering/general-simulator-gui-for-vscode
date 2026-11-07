import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { type DrawContext, SymbolLabel } from "./symbol-drawing";

const ctx = { rotation: 0, mirror: "none" } as unknown as DrawContext;

function drawn(text: string, maxWidth: number, size: "sm" | "md" | "lg" = "md") {
  const { container } = render(
    <svg aria-label="label">
      <SymbolLabel ctx={ctx} x={0} y={0} size={size} maxWidth={maxWidth}>
        {text}
      </SymbolLabel>
    </svg>,
  );
  const node = container.querySelector("text");
  return { text: node?.textContent ?? "", fontSize: Number(node?.getAttribute("font-size")) };
}

describe("text shrunk to fit its symbol", () => {
  it("keeps a string that fits exactly after shrinking", () => {
    // The regression: `fontSize` is divided so that advance*size*length lands
    // on `maxWidth`, and recomputing the quotient returned 3.9999999999999996
    // for this very case. It floored to 3, so a gain of sqrt(2) -- compacted
    // to the four characters "1.41" -- drew as "1.…" despite fitting by
    // construction.
    expect(drawn("1.41", 24).text).toBe("1.41");
  });

  it("shrinks rather than overflowing", () => {
    const { fontSize } = drawn("1.41", 24);
    expect(fontSize).toBeLessThan(13);
    expect(fontSize * 0.58 * 4).toBeLessThanOrEqual(24 + 1e-6);
  });

  it("leaves a short string at full size", () => {
    expect(drawn("133", 24)).toEqual({ text: "133", fontSize: 13 });
  });

  it("clips only once shrinking has hit its floor", () => {
    // Past the floor, overflow would run over the wires, so a character is
    // given up instead -- but the ellipsis has to mean something was lost.
    const { text } = drawn("0.011067758972493853", 24);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThan("0.011067758972493853".length);
  });
});
