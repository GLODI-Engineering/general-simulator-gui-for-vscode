import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatrixInput } from "./MatrixInput";

const box = () => screen.getByRole("textbox") as HTMLInputElement;

describe("MatrixInput", () => {
  it("shows an existing matrix in Python form", () => {
    render(
      <MatrixInput
        label="A"
        value={[
          [1, 2],
          [3, 4],
        ]}
        onCommit={vi.fn()}
      />,
    );
    expect(box().value).toBe("[[1, 2], [3, 4]]");
  });

  it("commits a valid matrix", () => {
    const onCommit = vi.fn();
    render(<MatrixInput label="A" value={[[0]]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "[[1, 0], [0, 1]]" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith([
      [1, 0],
      [0, 1],
    ]);
  });

  it("shows the shape, which the text does not make obvious", () => {
    render(<MatrixInput label="A" value={[[0]]} onCommit={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "[[1, 2, 3], [4, 5, 6]]" } });
    expect(screen.getByText("2x3")).toBeTruthy();
  });

  /** Named, not merely refused. */
  it("tells a MATLAB literal what to write instead", () => {
    const onCommit = vi.fn();
    render(<MatrixInput label="A" value={[[0]]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "[1 2; 3 4]" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/MATLAB/)).toBeTruthy();
    expect(screen.getByText(/\[\[1, 2\], \[3, 4\]\]/)).toBeTruthy();
  });

  it("refuses a ragged matrix and names the row", () => {
    const onCommit = vi.fn();
    render(<MatrixInput label="A" value={[[0]]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "[[1, 2], [3]]" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/Row 2/)).toBeTruthy();
  });

  it("does not commit an empty box over a real matrix", () => {
    const onCommit = vi.fn();
    render(<MatrixInput label="A" value={[[1]]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("follows the value when it changes underneath", () => {
    const { rerender } = render(<MatrixInput label="A" value={[[1]]} onCommit={vi.fn()} />);
    expect(box().value).toBe("[[1]]");
    rerender(<MatrixInput label="A" value={[[2]]} onCommit={vi.fn()} />);
    expect(box().value).toBe("[[2]]");
  });

  it("does not fight the user mid-typing", () => {
    const { rerender } = render(<MatrixInput label="A" value={[[1]]} onCommit={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "[[1, " } });
    rerender(<MatrixInput label="A" value={[[1]]} onCommit={vi.fn()} />);
    expect(box().value).toBe("[[1, ");
  });
});
