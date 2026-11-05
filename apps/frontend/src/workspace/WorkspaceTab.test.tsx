/**
 * FE-33/34: WorkspaceTab full tests
 */

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { WorkspaceTab } from "./WorkspaceTab";

describe("FE-33: WorkspaceTab", () => {
  it("renders without crashing", () => {
    expect(() => render(React.createElement(WorkspaceTab))).not.toThrow();
  });
});
