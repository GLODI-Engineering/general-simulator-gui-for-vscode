/**
 * Follow VS Code's colour theme.
 *
 * A webview is a separate document: it inherits none of the workbench's
 * styling, and nothing told ours which theme was active. So the viewer drew
 * a white chart inside a dark editor — not a subtle mismatch, a bright
 * rectangle in the middle of the window.
 *
 * VS Code marks the webview's `<body>` with `vscode-light`, `vscode-dark`
 * or `vscode-high-contrast`, and rewrites that class when the user switches
 * theme without reloading. So the class is both the initial answer and the
 * change notification, which is why this observes it rather than reading it
 * once at boot.
 *
 * Outside VS Code — the Vite dev server, the render harnesses, vitest —
 * there is no such class and this leaves `data-theme` alone, so a harness
 * can still set it explicitly.
 */

export type ThemeKind = "light" | "dark";

/** The theme VS Code is asking for, or null when this is not a webview. */
export function themeFromBody(body: Element | null): ThemeKind | null {
  if (!body) return null;
  const classes = body.classList;
  // High contrast comes in both polarities; `vscode-high-contrast-light` is
  // the light one, and it also carries `vscode-high-contrast`. Check the
  // light variant first or every high-contrast theme reads as dark.
  if (classes.contains("vscode-high-contrast-light")) return "light";
  if (classes.contains("vscode-light")) return "light";
  if (classes.contains("vscode-dark") || classes.contains("vscode-high-contrast")) return "dark";
  return null;
}

function apply(theme: ThemeKind | null): void {
  if (!theme) return;
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Keep `data-theme` in step with the workbench. Returns a disposer.
 */
export function followVsCodeTheme(): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const body = document.body;
  apply(themeFromBody(body));
  if (!body) return () => {};

  const observer = new MutationObserver(() => apply(themeFromBody(body)));
  observer.observe(body, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
