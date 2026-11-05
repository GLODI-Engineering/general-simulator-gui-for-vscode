import type * as vscode from "vscode";

/**
 * An OutputChannel that also mirrors to the extension host's console.
 *
 * VS Code only flushes an output channel to disk once a human opens it, so
 * without this a kernel-spawn failure is invisible to anything automated —
 * including a headless `--extensionDevelopmentPath` smoke run. Mirroring to
 * `console` puts the same lines in `exthost.log`, which *is* on disk.
 */
export function mirrorToConsole(channel: vscode.OutputChannel): vscode.OutputChannel {
  const proxy: vscode.OutputChannel = {
    ...channel,
    name: channel.name,
    append(value: string) {
      console.log(`[general-simulator] ${value.replace(/\n$/, "")}`);
      channel.append(value);
    },
    appendLine(value: string) {
      console.log(`[general-simulator] ${value}`);
      channel.appendLine(value);
    },
    replace: (value: string) => channel.replace(value),
    clear: () => channel.clear(),
    show: (...args: unknown[]) => (channel.show as (...a: unknown[]) => void)(...(args as never[])),
    hide: () => channel.hide(),
    dispose: () => channel.dispose(),
  };
  return proxy;
}
