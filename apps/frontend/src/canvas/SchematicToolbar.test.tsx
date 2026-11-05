/**
 * SchematicToolbar smoke test.
 *
 * SchematicToolbar renders inline content (no wrapping toolbar div of its
 * own) — it's spliced into shell/MainToolbar.tsx's single row via
 * shell/ActiveTabToolbar.tsx. The row's horizontal-wheel-scroll behavior is
 * that single shared container's concern, tested in MainToolbar.test.tsx.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGraphStore, useUiStore } from "../store";
import { useLibraryStore } from "../store/library";
import { SchematicToolbar } from "./SchematicToolbar";

afterEach(cleanup);

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useLibraryStore.setState(useLibraryStore.getInitialState());
});

describe("SchematicToolbar", () => {
  it("renders the canvas tool buttons and zoom controls without a wrapping toolbar element", () => {
    const { container } = render(<SchematicToolbar onAction={() => {}} />);

    expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wire" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Zoom In/ })).toBeTruthy();

    // No standalone toolbar wrapper — the component renders bare content
    // meant to be embedded in MainToolbar's single row.
    expect(container.querySelector(".schematic-toolbar")).toBeNull();
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });
});
