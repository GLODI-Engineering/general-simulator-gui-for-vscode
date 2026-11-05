/**
 * FE-176: PortCreateForm tests
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { PortCreateForm } from "./PortCreateForm";

describe("FE-176: PortCreateForm", () => {
  it("renders without crashing, pre-filled from the inferred side/offset", () => {
    render(
      React.createElement(PortCreateForm, {
        initialSide: "left",
        initialOffset: 20,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(screen.getByLabelText("Side")).toHaveValue("left");
    expect(screen.getByLabelText("Offset")).toHaveValue(20);
  });

  it("Cancel calls onCancel and does not call onConfirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      React.createElement(PortCreateForm, {
        initialSide: "top",
        initialOffset: 5,
        onConfirm,
        onCancel,
      }),
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("OK calls onConfirm with the entered id/label/type/direction and the pre-filled side/offset", () => {
    const onConfirm = vi.fn();
    render(
      React.createElement(PortCreateForm, {
        initialSide: "right",
        initialOffset: 12,
        onConfirm,
        onCancel: () => {},
      }),
    );

    fireEvent.change(screen.getByLabelText("Id"), { target: { value: "vout" } });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Vout" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "signal" } });
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "output" } });
    fireEvent.click(screen.getByText("OK"));

    expect(onConfirm).toHaveBeenCalledWith({
      id: "vout",
      label: "Vout",
      side: "right",
      offset: 12,
      kind: "signal",
      direction: "output",
    });
  });

  it("does not confirm with a blank id", () => {
    const onConfirm = vi.fn();
    render(
      React.createElement(PortCreateForm, {
        initialSide: "left",
        initialOffset: 5,
        onConfirm,
        onCancel: () => {},
      }),
    );
    fireEvent.change(screen.getByLabelText("Id"), { target: { value: "" } });
    fireEvent.click(screen.getByText("OK"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
