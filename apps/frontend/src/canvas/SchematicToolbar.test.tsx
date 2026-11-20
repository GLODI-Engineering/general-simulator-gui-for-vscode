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
import { loadCatalogFromManifest } from "../library/catalog";
import { useGraphStore, useUiStore } from "../store";
import { useLibraryStore } from "../store/library";
import { SPICE_COMPONENTS, SchematicToolbar } from "./SchematicToolbar";

afterEach(cleanup);

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useLibraryStore.setState(useLibraryStore.getInitialState());
});

describe("the one-click insert buttons", () => {
  /**
   * A dead insert button looks exactly like a live one.
   *
   * `ComponentBtn` resolves its `type` against the catalogue; with no entry it renders the bare
   * letter and pushes a "not found in catalog" toast when clicked. Two of these -- `Q` and `M`,
   * the BJT and the MOSFET -- became dead when gsim-core#59 pruned the engine's library to the
   * components it can compile, and every test in this repository still passed. They were found
   * by opening the app and looking at the toolbar, which is not a thing to rely on twice.
   */
  it("every insert button resolves in the catalogue", () => {
    const catalog = loadCatalogFromManifest();
    const dead = SPICE_COMPONENTS.filter((c) => catalog[c.type] === undefined).map(
      (c) => `${c.label} (${c.title}) -> ${c.type}`,
    );
    expect(
      dead,
      "toolbar buttons that would insert a component the catalogue does not have",
    ).toEqual([]);
  });
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
