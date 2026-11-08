/**
 * Put text on the clipboard, in a webview.
 *
 * `navigator.clipboard.writeText` is the right call and often the one that
 * fails: it needs a secure context and a permission a VS Code webview does
 * not always grant, and it rejects rather than throwing synchronously. The
 * old `execCommand` path still works in exactly those cases, so it is kept
 * as a fallback rather than as a preference.
 *
 * Returns whether the text got there, so a caller can say so instead of
 * silently doing nothing — which is the failure this whole session has been
 * about.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refused or not a secure context — fall through.
  }

  const area = document.createElement("textarea");
  try {
    area.value = text;
    // Off-screen but still focusable; `display: none` cannot be selected.
    area.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(area);
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    // In a `finally` because `execCommand` can throw, and a failed copy that
    // also leaves an invisible textarea in the document is two bugs.
    area.remove();
  }
}
