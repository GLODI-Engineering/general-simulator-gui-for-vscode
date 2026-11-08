import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "./copy-text";

const original = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: original, configurable: true });
  vi.restoreAllMocks();
});

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

describe("copyText", () => {
  it("uses the clipboard API when it works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  /** The case that matters: a webview that refuses the permission. */
  it("falls back when the clipboard API rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copyText("hello")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("falls back when there is no clipboard API at all", async () => {
    setClipboard(undefined);
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copyText("hello")).toBe(true);
  });

  it("reports failure rather than pretending, when both paths fail", async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: unknown }).execCommand = () => {
      throw new Error("nope");
    };
    expect(await copyText("hello")).toBe(false);
  });

  it("leaves no textarea behind", async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(true);
    await copyText("hello");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });
});
