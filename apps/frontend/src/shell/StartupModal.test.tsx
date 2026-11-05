/**
 * FE-29b: StartupModal tests
 */

import { render } from "@testing-library/react";
import React from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { StartupModal } from "./StartupModal";

describe("FE-29b: StartupModal", () => {
  it("renders recent model list from adapter", async () => {
    const mockAdapter = {
      list: async () => [{ id: "m1", name: "Project Alpha", openedAt: new Date().toISOString() }],
    };
    await act(async () => {
      render(
        React.createElement(StartupModal, {
          adapter: mockAdapter,
          onOpen: () => {},
          onNew: () => {},
        }),
      );
    });
    expect(document.body.textContent).toContain("Project Alpha");
  });
});
