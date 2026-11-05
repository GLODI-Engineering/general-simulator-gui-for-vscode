import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SweepEditor } from "./SweepEditor";

afterEach(cleanup);

describe("FE-61: SweepEditor", () => {
  it("test_sweep_lin: configuring a linear sweep with start=0 stop=10 n=11 produces 11 sweep points on dispatch", () => {
    const onChange = vi.fn();

    render(
      <SweepEditor sweep={{ kind: "linear", start: 0, stop: 10, n: 11 }} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as { points?: number[] };
    expect(last.points).toHaveLength(11);
    expect(last.points?.[0]).toBe(0);
    expect(last.points?.[10]).toBeCloseTo(10);
  });
});
