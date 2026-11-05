import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIpcStore } from "../store/ipc";
import { DcOpTable } from "./DcOpTable";

describe("FE-120 DcOpTable", () => {
  it("filters and sorts rows", () => {
    useIpcStore.setState({
      dcOpTable: [
        { node_or_branch: "V(n1)", quantity: "voltage", value: 5.0, unit: "V" },
        { node_or_branch: "I(R1)", quantity: "current", value: 0.002, unit: "A" },
      ],
    });

    render(<DcOpTable />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "V(" } });
    expect(screen.getByText("V(n1)")).toBeTruthy();
    expect(screen.queryByText("I(R1)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /value/i }));
    expect(screen.getByRole("table")).toBeTruthy();
  });
});
