/**
 * FE-29: file-ops command layer tests
 */

import { describe, expect, it, vi } from "vitest";
import type { ModelDocument } from "../model/types";
import { useUiStore } from "../store";
import type { ModelEntry, ModelRef, StorageAdapter } from "./StorageAdapter";
import {
  getFileSessionState,
  listRecentFiles,
  newFile,
  openFileById,
  setStorageAdapter,
} from "./file-ops";

function makeDocument(name: string): ModelDocument {
  return {
    schema_version: 2,
    model: {
      id: `model-${name}`,
      name,
      grid: 10,
      params: [],
      blocks: [],
      wires: [],
      lines: [],
      nets: [],
      simulation: {},
      metadata: {},
    },
  };
}

function makeFakeAdapter(entries: ModelEntry[], documents: Record<ModelRef, ModelDocument>) {
  const adapter: StorageAdapter = {
    list: vi.fn().mockResolvedValue(entries),
    load: vi.fn(async (id: ModelRef) => documents[id]),
    save: vi.fn().mockResolvedValue(undefined),
    saveAs: vi.fn().mockResolvedValue("ref"),
    delete: vi.fn().mockResolvedValue(undefined),
    importFromFile: vi.fn(),
    exportToFile: vi.fn(),
  };
  return adapter;
}

describe("FE-136: recent files (listRecentFiles / openFileById)", () => {
  it("listRecentFiles: delegates to the current adapter's list()", async () => {
    const entries: ModelEntry[] = [
      {
        id: "a.gsim_sch",
        name: "A",
        modifiedAt: "2026-01-01T00:00:00Z",
        openedAt: "2026-01-02T00:00:00Z",
      },
    ];
    const adapter = makeFakeAdapter(entries, {});
    setStorageAdapter(adapter);

    await expect(listRecentFiles()).resolves.toEqual(entries);
    expect(adapter.list).toHaveBeenCalled();
  });

  it("openFileById: loads the document and updates currentFilePath so a later Save writes back in place", async () => {
    const doc = makeDocument("Recent Model");
    const adapter = makeFakeAdapter([], { "recent.gsim_sch": doc });
    setStorageAdapter(adapter);

    const result = await openFileById("recent.gsim_sch");

    expect(result).toBe(doc);
    expect(adapter.load).toHaveBeenCalledWith("recent.gsim_sch");
    expect(getFileSessionState().currentRef).toBe("recent.gsim_sch");
    expect(useUiStore.getState().currentFilePath).toBe("recent.gsim_sch");
  });
});

describe("FE-29: file-ops", () => {
  it("confirm-discard: Yes clears the undo stack and resets store", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    const mockClearUndo = vi.fn();
    const mockReset = vi.fn();

    await newFile({ confirm: mockConfirm, clearUndo: mockClearUndo, resetStore: mockReset });
    expect(mockClearUndo).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it("confirm-discard: No leaves the store intact", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(false);
    const mockClearUndo = vi.fn();
    const mockReset = vi.fn();

    await newFile({ confirm: mockConfirm, clearUndo: mockClearUndo, resetStore: mockReset });
    expect(mockClearUndo).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });
});
