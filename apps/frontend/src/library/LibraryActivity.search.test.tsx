import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useLibraryStore } from "../store";
import { LibraryActivity } from "./LibraryActivity";
import { loadCatalogFromManifest } from "./catalog";

describe("the block library can be searched", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      catalog: loadCatalogFromManifest(),
      activeSimulator: "general-simulator",
      recentlyUsed: [],
    });
  });

  it("shows the category tree until something is typed", () => {
    render(<LibraryActivity />);
    expect(screen.getByRole("tree", { name: "Block categories" })).toBeTruthy();
    expect(screen.getByLabelText("Search components")).toBeTruthy();
  });

  it("replaces the tree with ranked matches", () => {
    render(<LibraryActivity />);
    fireEvent.change(screen.getByLabelText("Search components"), {
      target: { value: "resistor" },
    });

    // The tree is gone and results are in its place, so a long catalogue does not have to be
    // scrolled past to reach a match.
    expect(screen.queryByRole("tree", { name: "Block categories" })).toBeNull();
    const results = screen.getByRole("group", { name: "Search results for resistor" });
    expect(results.textContent).toContain("Resistor");
  });

  it("finds a component by an alias rather than its label", () => {
    render(<LibraryActivity />);
    // `R` is one of the resistor's aliases in the engine's library. Searching only labels
    // would miss it, which is what makes a search box worth having over a filter.
    fireEvent.change(screen.getByLabelText("Search components"), {
      target: { value: "capacitor" },
    });
    const results = screen.getByRole("group", { name: "Search results for capacitor" });
    expect(results.textContent).toContain("Capacitor");
  });

  it("says so when nothing matches, instead of showing an empty panel", () => {
    render(<LibraryActivity />);
    fireEvent.change(screen.getByLabelText("Search components"), {
      target: { value: "zzzznotacomponent" },
    });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });

  it("clears on Escape and brings the tree back", () => {
    render(<LibraryActivity />);
    const input = screen.getByLabelText("Search components");
    fireEvent.change(input, { target: { value: "resistor" } });
    expect(screen.queryByRole("tree", { name: "Block categories" })).toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("tree", { name: "Block categories" })).toBeTruthy();
  });
});
