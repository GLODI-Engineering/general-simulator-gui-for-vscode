export const DB_NAME = "general-simulator";
export const DB_VERSION = 1;
export const MODELS_STORE = "models";

export interface StoredModelRecord {
  id: string;
  name: string;
  document: unknown;
  modifiedAt: string;
  openedAt: string;
}

export function upgradeDatabase(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(MODELS_STORE)) {
    database.createObjectStore(MODELS_STORE, { keyPath: "id" });
  }
}
