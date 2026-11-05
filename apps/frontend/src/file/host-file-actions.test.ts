import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setVsCodeApi } from "../ipc/vscode-host";
import { handleHostFileAction } from "./host-file-actions";

let posted: unknown[] = [];

function installFakeHost(): void {
  posted = [];
  setVsCodeApi({
    postMessage: (message: unknown) => {
      posted.push(message);
    },
    getState: () => undefined,
    setState: (state: unknown) => state,
  });
}

afterEach(() => {
  setVsCodeApi(null);
});

describe("handleHostFileAction outside VS Code", () => {
  beforeEach(() => {
    setVsCodeApi(null);
    posted = [];
  });

  it.each([
    "file.new",
    "file.open",
    "file.save",
    "file.save-as",
    "file.close",
    "file.export",
    "canvas.tool-wire",
  ])("does not intercept %s", (actionId) => {
    expect(handleHostFileAction(actionId)).toBe(false);
    expect(posted).toEqual([]);
  });
});

describe("handleHostFileAction inside VS Code", () => {
  beforeEach(installFakeHost);

  it.each([
    ["file.new", { type: "gsim/newSchematic" }],
    ["file.open", { type: "gsim/openSchematic" }],
    ["file.save", { type: "gsim/saveDocument" }],
    ["file.save-as", { type: "gsim/saveDocument", as: true }],
    ["file.close", { type: "gsim/closeDocument" }],
  ])("hands %s to the extension host", (actionId, message) => {
    expect(handleHostFileAction(actionId)).toBe(true);
    expect(posted).toEqual([message]);
  });

  it("leaves actions VS Code does not own to the app", () => {
    expect(handleHostFileAction("file.export")).toBe(false);
    expect(handleHostFileAction("file.import-netlist")).toBe(false);
    expect(handleHostFileAction("canvas.tool-wire")).toBe(false);
    expect(posted).toEqual([]);
  });
});
