import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIpcStore } from "../store/ipc";
import { SignalBrowser } from "./SignalBrowser";

describe("FE-112 SignalBrowser", () => {
  it("renders manifest signals and supports collapse toggle", () => {
    useIpcStore.setState({
      lastManifest: {
        sim_id: "sim-1",
        t_start: 0,
        t_end: 1,
        n_points: 2,
        manifest_url: "/results/sim-1/manifest.json",
        signals: ["V(out)", "I(R1)"],
      },
    });

    render(<SignalBrowser />);
    expect(screen.getByText("V(out)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /sim-1/i }));
    expect(screen.queryByText("V(out)")).toBeNull();
  });
});
