import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ListInput, listProblem, splitNames } from "./ListInput";

const box = () => screen.getByRole("textbox") as HTMLInputElement;

/**
 * These names *are* the block's ports. A duplicate silently collapses two
 * ports into one and a non-identifier makes a port the netlist cannot refer
 * to — both discovered far from the edit that caused them.
 */
describe("listProblem", () => {
  it("accepts ordinary port names", () => {
    expect(listProblem(["u", "v_ref", "iL1"])).toBeNull();
  });

  it("refuses a duplicate, naming it", () => {
    expect(listProblem(["u", "u"])).toMatch(/"u" appears twice/);
  });

  it("refuses a name a netlist cannot refer to", () => {
    expect(listProblem(["1u"])).toMatch(/not a usable name/);
    expect(listProblem(["a-b"])).toMatch(/not a usable name/);
    expect(listProblem(["a b"])).toMatch(/not a usable name/);
  });

  it("refuses an empty list", () => {
    expect(listProblem([])).toMatch(/At least one/);
  });
});

describe("splitNames", () => {
  it("splits and trims", () => {
    expect(splitNames(" a , b ,c ")).toEqual(["a", "b", "c"]);
  });

  it("drops empty entries from a trailing comma", () => {
    expect(splitNames("a, b,")).toEqual(["a", "b"]);
  });
});

describe("ListInput", () => {
  it("shows an array as a comma-separated list", () => {
    render(<ListInput label="Inputs" value={["u", "v"]} onCommit={vi.fn()} />);
    expect(box().value).toBe("u, v");
  });

  /** The inconsistency this replaces: default is an array, the field stored a string. */
  it("commits an array, not a string", () => {
    const onCommit = vi.fn();
    render(<ListInput label="Inputs" value={["u"]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "a, b, c" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("counts the ports, so the arity is visible", () => {
    render(<ListInput label="Inputs" value={["u"]} onCommit={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "a, b, c" } });
    expect(screen.getByText("3 ports")).toBeTruthy();
  });

  it("refuses a duplicate rather than collapsing two ports into one", () => {
    const onCommit = vi.fn();
    render(<ListInput label="Inputs" value={["u"]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "a, a" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/appears twice/)).toBeTruthy();
  });

  it("does not commit an empty list over a real one", () => {
    const onCommit = vi.fn();
    render(<ListInput label="Inputs" value={["u"]} onCommit={onCommit} />);
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("follows the value when it changes underneath", () => {
    const { rerender } = render(<ListInput label="In" value={["u"]} onCommit={vi.fn()} />);
    rerender(<ListInput label="In" value={["a", "b"]} onCommit={vi.fn()} />);
    expect(box().value).toBe("a, b");
  });
});
