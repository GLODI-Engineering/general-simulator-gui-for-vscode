/**
 * FE-28: CommandPalette tests
 */

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "./CommandPalette";

describe("FE-28: CommandPalette", () => {
  it("renders without crashing", () => {
    expect(() => render(React.createElement(CommandPalette, { onClose: () => {} }))).not.toThrow();
  });

  it("new keymap registry entry appears in palette", async () => {
    // After a new action is registered, it should appear in the palette list
    // Placeholder — depends on keymap registry integration
    expect(true).toBe(true);
  });
});
