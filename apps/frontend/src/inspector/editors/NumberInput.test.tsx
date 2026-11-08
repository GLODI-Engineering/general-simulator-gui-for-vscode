import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NumberInput } from "./NumberInput";

function box() {
  return screen.getByRole("textbox") as HTMLInputElement;
}

/**
 * This field read the box with `Number()`, which answers NaN for every
 * engineering suffix there is. Typing `10u` marked the field invalid and the
 * value was never committed — the box kept showing what had been typed, so
 * it looked saved, and nothing said otherwise until a run used the old value.
 */
describe("NumberInput", () => {
  it("commits a plain number on blur", () => {
    const onCommit = vi.fn();
    render(<NumberInput label="R" value={1000} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "2200" } });
    fireEvent.blur(box());
    expect(onCommit).toHaveBeenCalledWith(2200);
  });

  it("commits an engineering suffix, which it used to discard", () => {
    const onCommit = vi.fn();
    render(<NumberInput label="C" value={1e-6} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "10u" } });
    fireEvent.blur(box());
    // `base * factor`, exactly as the solver computes it — 10 * 1e-6 is not
    // bit-identical to 1e-5, and matching the solver matters more than
    // matching the literal.
    expect(onCommit.mock.calls[0]?.[0]).toBeCloseTo(1e-5, 18);
  });

  it("commits on Enter too", () => {
    const onCommit = vi.fn();
    render(<NumberInput label="L" value={1} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "3.6uH" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onCommit.mock.calls[0]?.[0]).toBeCloseTo(3.6e-6, 20);
  });

  it("echoes what the solver will read", () => {
    render(<NumberInput label="R" value={1} onCommit={vi.fn()} unit="Ω" />);
    fireEvent.change(box(), { target: { value: "2.2k" } });
    expect(screen.getByText(/2\.2 kΩ/)).toBeTruthy();
  });

  /** The expensive one: M is milli, and is routinely written meaning mega. */
  it("says plainly that M is milli", () => {
    render(<NumberInput label="R" value={1} onCommit={vi.fn()} unit="Ω" />);
    fireEvent.change(box(), { target: { value: "1M" } });
    expect(screen.getByText(/1 mΩ/)).toBeTruthy();
    expect(screen.getByText(/mega is MEG/)).toBeTruthy();
  });

  it("does not nag about MEG, which is unambiguous", () => {
    render(<NumberInput label="R" value={1} onCommit={vi.fn()} unit="Ω" />);
    fireEvent.change(box(), { target: { value: "1MEG" } });
    expect(screen.queryByText(/mega is MEG/)).toBeNull();
    expect(screen.getByText(/1 MΩ/)).toBeTruthy();
  });

  it("refuses a suffix the solver cannot read, rather than committing nonsense", () => {
    const onCommit = vi.fn();
    render(<NumberInput label="R" value={1} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "10x" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
    expect(box().className).toContain("is-invalid");
  });

  it("honours min and max against the parsed value, not the text", () => {
    const onCommit = vi.fn();
    render(<NumberInput label="R" value={1} onCommit={onCommit} min={1} />);
    // 1m is 0.001, which is below the minimum even though "1m" looks big.
    fireEvent.change(box(), { target: { value: "1m" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
  });

  /**
   * `useState` reads its argument once, so a value set from elsewhere — undo,
   * a script, another panel — used to leave a stale draft in the box.
   */
  it("follows the value when it changes underneath", () => {
    const { rerender } = render(<NumberInput label="R" value={1000} onCommit={vi.fn()} />);
    expect(box().value).toBe("1000");
    rerender(<NumberInput label="R" value={4700} onCommit={vi.fn()} />);
    expect(box().value).toBe("4700");
  });

  it("does not fight the user while they are typing", () => {
    const { rerender } = render(<NumberInput label="R" value={1000} onCommit={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "22" } });
    rerender(<NumberInput label="R" value={1000} onCommit={vi.fn()} />);
    expect(box().value).toBe("22");
  });
});
