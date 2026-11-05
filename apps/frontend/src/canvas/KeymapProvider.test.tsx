/**
 * FE-06 / FE-94: KeymapProvider component tests
 */

import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KeymapProvider } from "./KeymapProvider";

describe("KeymapProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders children without error", () => {
    expect(() =>
      render(
        <KeymapProvider getContexts={() => ["canvas", "global"]} onAction={() => {}}>
          <div data-testid="child">ok</div>
        </KeymapProvider>,
      ),
    ).not.toThrow();
  });

  it("single Ctrl+. dispatches command palette after sequence timeout", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(
      <KeymapProvider getContexts={() => ["canvas", "global"]} onAction={onAction}>
        <div>ok</div>
      </KeymapProvider>,
    );

    fireEvent.keyDown(window, { key: ".", ctrlKey: true });
    expect(onAction).not.toHaveBeenCalled();

    vi.advanceTimersByTime(710);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]?.[0]).toBe("palette.command");
  });

  it("double Ctrl+. dispatches quick insert", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(
      <KeymapProvider getContexts={() => ["canvas", "global"]} onAction={onAction}>
        <div>ok</div>
      </KeymapProvider>,
    );

    fireEvent.keyDown(window, { key: ".", ctrlKey: true });
    fireEvent.keyDown(window, { key: ".", ctrlKey: true });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]?.[0]).toBe("palette.quick-insert");

    vi.advanceTimersByTime(710);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
