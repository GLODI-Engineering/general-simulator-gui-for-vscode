/**
 * FE-04: IPC store — status transitions tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useIpcStore } from "./ipc";

beforeEach(() => {
  useIpcStore.setState({
    status: "disconnected",
    pendingIds: new Map(),
    lastManifest: null,
    workspaceVariables: [],
    waveformSlice: null,
    output: [],
    problems: [],
  });
});

describe("FE-04: IPC store — status transitions", () => {
  it("initial status is disconnected", () => {
    expect(useIpcStore.getState().status).toBe("disconnected");
  });

  it("disconnected → connecting", () => {
    useIpcStore.getState().setStatus("connecting");
    expect(useIpcStore.getState().status).toBe("connecting");
  });

  it("connecting → idle", () => {
    useIpcStore.getState().setStatus("connecting");
    useIpcStore.getState().setStatus("idle");
    expect(useIpcStore.getState().status).toBe("idle");
  });

  it("idle → busy → idle", () => {
    useIpcStore.getState().setStatus("idle");
    useIpcStore.getState().setStatus("busy");
    expect(useIpcStore.getState().status).toBe("busy");
    useIpcStore.getState().setStatus("idle");
    expect(useIpcStore.getState().status).toBe("idle");
  });

  it("error → retry (connecting)", () => {
    useIpcStore.getState().setStatus("error");
    useIpcStore.getState().setStatus("connecting");
    expect(useIpcStore.getState().status).toBe("connecting");
  });

  it("pendingIds is a Map", () => {
    expect(useIpcStore.getState().pendingIds).toBeInstanceOf(Map);
  });

  it("addPendingId / removePendingId round-trip", () => {
    useIpcStore.getState().setPending("req1", { action: "simulate", startedAt: Date.now() });
    expect(useIpcStore.getState().pendingIds.has("req1")).toBe(true);
    useIpcStore.getState().clearPending("req1");
    expect(useIpcStore.getState().pendingIds.has("req1")).toBe(false);
  });
});

describe("FE-154: registerLiveSignal — builds a live manifest as signals start streaming", () => {
  it("first signal of a run starts a provisional manifest", () => {
    useIpcStore.getState().registerLiveSignal("sim-1", "v(out)");
    expect(useIpcStore.getState().lastManifest).toEqual({
      sim_id: "sim-1",
      signals: ["v(out)"],
      t_start: 0,
      t_end: 0,
    });
  });

  it("later signals of the same run are appended, not duplicated", () => {
    useIpcStore.getState().registerLiveSignal("sim-1", "v(out)");
    useIpcStore.getState().registerLiveSignal("sim-1", "i(v1)");
    useIpcStore.getState().registerLiveSignal("sim-1", "v(out)"); // duplicate chunk

    expect(useIpcStore.getState().lastManifest?.signals).toEqual(["v(out)", "i(v1)"]);
  });

  it("a signal from a new sim_id starts a fresh manifest instead of merging", () => {
    useIpcStore.getState().registerLiveSignal("sim-1", "v(out)");
    useIpcStore.getState().registerLiveSignal("sim-2", "v(new-run)");

    expect(useIpcStore.getState().lastManifest).toEqual({
      sim_id: "sim-2",
      signals: ["v(new-run)"],
      t_start: 0,
      t_end: 0,
    });
  });

  it("the authoritative setLastManifest() at run completion still overwrites the provisional one", () => {
    useIpcStore.getState().registerLiveSignal("sim-1", "v(out)");
    useIpcStore.getState().setLastManifest({
      sim_id: "sim-1",
      signals: ["v(out)", "i(v1)"],
      t_start: 0,
      t_end: 0.01,
    });

    expect(useIpcStore.getState().lastManifest?.signals).toEqual(["v(out)", "i(v1)"]);
    expect(useIpcStore.getState().lastManifest?.t_end).toBe(0.01);
  });
});
