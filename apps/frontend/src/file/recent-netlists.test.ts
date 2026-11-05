import { beforeEach, describe, expect, it } from "vitest";
import { useIpcStore } from "../store";
import {
  clearRecentNetlists,
  listRecentNetlists,
  openRecentNetlist,
  recordRecentNetlist,
} from "./recent-netlists";

beforeEach(() => {
  clearRecentNetlists();
  useIpcStore.setState(useIpcStore.getInitialState());
});

describe("recent-netlists", () => {
  it("records an imported netlist and lists it newest-first", () => {
    recordRecentNetlist("a.cir", "R1 1 0 1k\n.end\n");
    recordRecentNetlist("b.cir", "R2 1 0 2k\n.end\n");

    const entries = listRecentNetlists();
    expect(entries.map((e) => e.name)).toEqual(["b.cir", "a.cir"]);
  });

  it("re-importing the same name replaces the old entry instead of duplicating it", () => {
    recordRecentNetlist("a.cir", "R1 1 0 1k\n.end\n");
    recordRecentNetlist("a.cir", "R1 1 0 2k\n.end\n");

    const entries = listRecentNetlists();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("2k");
  });

  it("caps the list at 8 entries", () => {
    for (let i = 0; i < 10; i++) {
      recordRecentNetlist(`n${i}.cir`, `* netlist ${i}\n.end\n`);
    }
    expect(listRecentNetlists()).toHaveLength(8);
  });

  it("openRecentNetlist loads the stored text as the imported netlist and switches to the Netlist tab", () => {
    recordRecentNetlist("a.cir", "R1 1 0 1k\n.end\n");
    const [entry] = listRecentNetlists();
    if (!entry) throw new Error("expected a recorded entry");

    useIpcStore.setState({ status: "busy", simProgress: 0.4 });

    openRecentNetlist(entry);

    const state = useIpcStore.getState();
    expect(state.importedNetlist).toBe("R1 1 0 1k\n.end\n");
    expect(state.lastNetlist).toBe("R1 1 0 1k\n.end\n");
    expect(state.activeEditorTabId).toBe("core.netlist");
    // resetForNewModel() must run first — a stuck busy state from whatever
    // was loaded before must not carry over into the reopened netlist.
    expect(state.status).toBe("idle");
    expect(state.simProgress).toBeNull();
  });
});
