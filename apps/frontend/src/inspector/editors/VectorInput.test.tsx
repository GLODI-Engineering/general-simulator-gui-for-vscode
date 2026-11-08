import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VectorInput } from "./VectorInput";

const box = () => screen.getByRole("textbox") as HTMLInputElement;

describe("VectorInput", () => {
  it("commits a list of numbers", () => {
    const onCommit = vi.fn();
    render(<VectorInput label="den" value={[1, 1]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "1, 0" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith([1, 0]);
  });

  it("accepts engineering suffixes per element", () => {
    const onCommit = vi.fn();
    render(<VectorInput label="num" value={[1]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "1u, 2.2k" } });
    fireEvent.blur(box());
    const [got] = onCommit.mock.calls[0] as [number[]];
    expect(got[0]).toBeCloseTo(1e-6, 20);
    expect(got[1]).toBe(2200);
  });

  /** Blurring an empty box used to commit [] over a real vector. */
  it("does not commit an empty vector over a real one", () => {
    const onCommit = vi.fn();
    render(<VectorInput label="den" value={[1, 0]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("refuses a malformed element rather than dropping it", () => {
    const onCommit = vi.fn();
    render(<VectorInput label="den" value={[1, 0]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "1, 10x" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
    expect(box().className).toContain("is-invalid");
  });

  /**
   * The fault that can revert someone else's edit: `useState` reads its
   * argument once, so a value changed underneath left a stale draft, and
   * that draft is what the next blur commits.
   */
  it("follows the value when it changes underneath", () => {
    const { rerender } = render(<VectorInput label="den" value={[1, 1]} onCommit={vi.fn()} />);
    expect(box().value).toBe("1, 1");
    rerender(<VectorInput label="den" value={[1, 0]} onCommit={vi.fn()} />);
    expect(box().value).toBe("1, 0");
  });

  it("does not fight the user mid-typing", () => {
    const { rerender } = render(<VectorInput label="den" value={[1, 1]} onCommit={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "1, 2, " } });
    rerender(<VectorInput label="den" value={[1, 1]} onCommit={vi.fn()} />);
    expect(box().value).toBe("1, 2, ");
  });

  it("tolerates trailing separators while typing", () => {
    const onCommit = vi.fn();
    render(<VectorInput label="den" value={[1]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "1, 0," } });
    fireEvent.blur(box());
    expect(onCommit).toHaveBeenCalledWith([1, 0]);
  });
});
