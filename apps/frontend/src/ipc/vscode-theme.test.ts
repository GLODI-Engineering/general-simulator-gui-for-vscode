import { describe, expect, it } from "vitest";

import { followVsCodeTheme, themeFromBody } from "./vscode-theme";

function bodyWith(...classes: string[]): Element {
  const element = document.createElement("div");
  for (const name of classes) element.classList.add(name);
  return element;
}

describe("themeFromBody", () => {
  it("reads the class VS Code puts on a webview's body", () => {
    expect(themeFromBody(bodyWith("vscode-light"))).toBe("light");
    expect(themeFromBody(bodyWith("vscode-dark"))).toBe("dark");
  });

  it("treats high contrast as dark, and its light variant as light", () => {
    // `vscode-high-contrast-light` carries `vscode-high-contrast` as well,
    // so checking the generic class first makes every high-contrast theme
    // read as dark — including the white one.
    expect(themeFromBody(bodyWith("vscode-high-contrast"))).toBe("dark");
    expect(themeFromBody(bodyWith("vscode-high-contrast", "vscode-high-contrast-light"))).toBe(
      "light",
    );
  });

  it("says nothing when this is not a webview", () => {
    // The dev server and the render harnesses set data-theme themselves;
    // guessing here would override them.
    expect(themeFromBody(bodyWith())).toBeNull();
    expect(themeFromBody(null)).toBeNull();
  });
});

describe("followVsCodeTheme", () => {
  it("applies the theme that is already set", () => {
    document.body.className = "vscode-dark";
    document.documentElement.removeAttribute("data-theme");
    const stop = followVsCodeTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    stop();
  });

  it("follows a theme switch, which happens without a reload", async () => {
    document.body.className = "vscode-dark";
    const stop = followVsCodeTheme();
    document.body.className = "vscode-light";
    // MutationObserver callbacks are delivered as microtasks.
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    stop();
  });

  it("leaves an explicitly set theme alone outside VS Code", () => {
    document.body.className = "";
    document.documentElement.setAttribute("data-theme", "light");
    const stop = followVsCodeTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    stop();
  });
});
