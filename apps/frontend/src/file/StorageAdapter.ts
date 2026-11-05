import type { ModelDocument } from "../model/types";

export type ModelRef = string;

export interface ModelEntry {
  id: ModelRef;
  name: string;
  modifiedAt: string;
  openedAt: string;
}

export interface ImportResult {
  document: ModelDocument;
  ref: ModelRef;
}

export interface StorageAdapter {
  list(): Promise<ModelEntry[]>;
  load(id: ModelRef): Promise<ModelDocument>;
  save(id: ModelRef, doc: ModelDocument): Promise<void>;
  saveAs(doc: ModelDocument): Promise<ModelRef>;
  delete(id: ModelRef): Promise<void>;
  importFromFile(): Promise<ImportResult>;
  exportToFile(doc: ModelDocument): Promise<void>;
}
