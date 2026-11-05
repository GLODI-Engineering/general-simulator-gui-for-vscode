import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ColorSwatch } from "./ColorSwatch";

describe("FE-161 ColorSwatch", () => {
  it("renders a swatch with the current color and calls onChange with a new hex value", () => {
    const onChange = vi.fn();
    render(<ColorSwatch color="#3b82f6" label="v(out)" onChange={onChange} />);

    const colorInput = screen.getByLabelText("v(out) color") as HTMLInputElement;
    expect(colorInput.value).toBe("#3b82f6");

    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("clicking the visible swatch button opens the color input", () => {
    const onChange = vi.fn();
    render(<ColorSwatch color="#3b82f6" label="v(out)" onChange={onChange} />);

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    fireEvent.click(screen.getByRole("button", { name: /change color for v\(out\)/i }));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
