import { beforeEach, describe, expect, it, vi } from "vitest";

import * as transport from "../ipc/transport";
import { useGraphStore, useIpcStore, useUiStore } from "../store";
import { useToastStore } from "../store/toast";
import { hasAnythingToSimulate, triggerRun } from "./run";

/**
 * Clicking Run used to be able to do nothing visible at all — twice over.
 * The kernel-disconnected path returned bare, with its reason written only
 * to the Output panel, which need not be open; and an empty schematic was
 * never checked, so that click also did nothing, for a different reason the
 * user had no way to tell apart.
 */
beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  useIpcStore.setState({ importedNetlist: null });
});

function setBlocks(count: number) {
  const doc = useGraphStore.getState().document;
  useGraphStore.setState({
    document: {
      ...doc,
      model: {
        ...doc.model,
        blocks: Array.from({ length: count }, (_, i) => ({ id: `b${i}` })),
      },
    },
  } as never);
}

describe("hasAnythingToSimulate", () => {
  it("is false for a sheet with no blocks", () => {
    setBlocks(0);
    expect(hasAnythingToSimulate()).toBe(false);
  });

  it("is true once a component is on the sheet", () => {
    setBlocks(1);
    expect(hasAnythingToSimulate()).toBe(true);
  });
});

describe("triggerRun on an empty sheet", () => {
  it("says so instead of doing nothing", async () => {
    setBlocks(0);
    await triggerRun();
    const messages = useToastStore.getState().toasts.map((t) => t.message);
    expect(messages.some((m) => /empty/i.test(m))).toBe(true);
  });

  it("does not try to reach the kernel for an empty sheet", async () => {
    setBlocks(0);
    const spy = vi.spyOn(useIpcStore.getState(), "appendOutput");
    await triggerRun();
    // ensureKernelConnected announces itself through appendOutput; an empty
    // sheet must be refused before any of that happens.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("a run the backend refuses", () => {
  /**
   * The reported bug: *"I click on the simulation button at the top and nothing is happening"*.
   *
   * The backend was in fact answering in about a millisecond, with a precise reason —
   * `SolverUnavailable: gsim_py is not installed…`. The front end wrote it to the Output panel
   * and the Problems list and did nothing else, and both of those live in the bottom panel,
   * which starts hidden and is not mounted in every shell. So a failed run was indistinguishable
   * from a button that did not work. Confirmed in a browser against a live kernel before this
   * was changed: the words never reached the DOM at all.
   */
  const failure = {
    status: "error" as const,
    manifest: { sim_id: "", signals: [], t_start: 0, t_end: 0 },
    chunks: [
      "gsim_py is not installed, and gsim_tools.schematic needs it.\nBuild it with maturin.",
    ],
  };

  beforeEach(() => {
    useIpcStore.setState({ status: "idle", problems: [] });
    useUiStore.setState({ bottomPanelVisible: false });
    setBlocks(2);
  });

  it("says a run failed, where the user is looking", async () => {
    vi.spyOn(transport, "getIpcClient").mockReturnValue({
      execute: async () => failure,
      cancel: () => {},
    } as never);
    await triggerRun();

    const messages = useToastStore.getState().toasts.map((t) => t.message);
    expect(messages.some((m) => /Simulation failed/i.test(m))).toBe(true);
    // The first line only — the real message is a paragraph of build instructions, and a toast
    // is the wrong place to read one.
    expect(messages.some((m) => m.includes("Build it with maturin"))).toBe(false);
    expect(messages.some((m) => m.includes("gsim_py is not installed"))).toBe(true);
  });

  it("keeps the whole reason somewhere it can be read", async () => {
    vi.spyOn(transport, "getIpcClient").mockReturnValue({
      execute: async () => failure,
      cancel: () => {},
    } as never);
    await triggerRun();

    const problems = useIpcStore.getState().problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]?.severity).toBe("error");
    expect(problems[0]?.message).toContain("Build it with maturin");
  });

  it("opens the panel holding it", async () => {
    vi.spyOn(transport, "getIpcClient").mockReturnValue({
      execute: async () => failure,
      cancel: () => {},
    } as never);
    await triggerRun();

    // The panel starts hidden; a failure that writes into it without opening it is the bug.
    expect(useUiStore.getState().bottomPanelVisible).toBe(true);
    expect(useUiStore.getState().activeBottomTabId).toBe("core.problems");
  });

  it("does not show a waveform tab for a run that produced none", async () => {
    vi.spyOn(transport, "getIpcClient").mockReturnValue({
      execute: async () => failure,
      cancel: () => {},
    } as never);
    await triggerRun();
    expect(useIpcStore.getState().lastManifest).not.toEqual(failure.manifest);
  });
});
