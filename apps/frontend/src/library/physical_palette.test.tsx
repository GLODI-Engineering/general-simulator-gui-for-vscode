import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PhysicalPalette } from "./physical_palette";

afterEach(cleanup);

describe("FE-55 physical palette", () => {
  it("test_converters_palette_render: the Converters sub-group lists at least signal_to_physical_signal and physical_signal_to_signal", () => {
    const { container } = render(<PhysicalPalette />);

    const convertersHeading = screen.getByRole("heading", { name: "Converters" });
    const convertersSection = convertersHeading.closest("section");
    expect(convertersSection).not.toBeNull();

    if (!convertersSection) throw new Error("Converters section not found");

    const scoped = within(convertersSection);
    expect(scoped.getByText("signal_to_physical_signal")).toBeTruthy();
    expect(scoped.getByText("physical_signal_to_signal")).toBeTruthy();

    expect(container.querySelectorAll(".library-item").length).toBeGreaterThan(0);
  });

  it("test_physical_palette_search: typing 'mosfet' returns physical-electrical.semiconductor.mosfet_n in the top results", async () => {
    const { container } = render(<PhysicalPalette />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "mosfet" } });

    await waitFor(() => {
      expect(screen.getByText("mosfet_n")).toBeTruthy();
    });

    const labels = Array.from(container.querySelectorAll(".library-item__label")).map((node) =>
      node.textContent?.trim(),
    );

    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toBe("mosfet_n");
  });
});
