import type { ModelDocument } from "../../model/types";
import type { ImportResult, ModelEntry, ModelRef, StorageAdapter } from "../StorageAdapter";
import { deserialize } from "../deserializer";
import { exportModel } from "../export";
import { importModel } from "../import";
import { serialize } from "../serializer";
import {
  DB_NAME,
  DB_VERSION,
  MODELS_STORE,
  type StoredModelRecord,
  upgradeDatabase,
} from "./idb-schema";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function cloneDocument(document: ModelDocument): ModelDocument {
  return deserialize(serialize(document));
}

export class IndexedDbAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          upgradeDatabase(request.result);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
      });
    }
    return this.dbPromise;
  }

  private async putRecord(record: StoredModelRecord): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction(MODELS_STORE, "readwrite");
    transaction.objectStore(MODELS_STORE).put(record);
    await transactionDone(transaction);
  }

  async list(): Promise<ModelEntry[]> {
    const db = await this.openDatabase();
    const transaction = db.transaction(MODELS_STORE, "readonly");
    const records = (await requestToPromise(
      transaction.objectStore(MODELS_STORE).getAll(),
    )) as StoredModelRecord[];
    await transactionDone(transaction);
    return records
      .map((record) => ({
        id: record.id,
        name: record.name,
        modifiedAt: record.modifiedAt,
        openedAt: record.openedAt,
      }))
      .sort((left, right) => right.openedAt.localeCompare(left.openedAt));
  }

  async load(id: ModelRef): Promise<ModelDocument> {
    const db = await this.openDatabase();
    const transaction = db.transaction(MODELS_STORE, "readwrite");
    const store = transaction.objectStore(MODELS_STORE);
    const record = (await requestToPromise(store.get(id))) as StoredModelRecord | undefined;
    if (!record) {
      transaction.abort();
      throw new Error(`Model not found: ${id}`);
    }
    const openedAt = new Date().toISOString();
    store.put({ ...record, openedAt });
    await transactionDone(transaction);
    return deserialize(serialize(record.document as ModelDocument));
  }

  async save(id: ModelRef, doc: ModelDocument): Promise<void> {
    const now = new Date().toISOString();
    await this.putRecord({
      id,
      name: doc.model.name,
      document: cloneDocument(doc),
      modifiedAt: now,
      openedAt: now,
    });
  }

  async saveAs(doc: ModelDocument): Promise<ModelRef> {
    const copy = cloneDocument(doc);
    const nextId = `${copy.model.id}-copy-${Date.now()}`;
    copy.model.id = nextId;
    copy.model.name = `${copy.model.name} Copy`;
    await this.save(nextId, copy);
    return nextId;
  }

  async delete(id: ModelRef): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction(MODELS_STORE, "readwrite");
    transaction.objectStore(MODELS_STORE).delete(id);
    await transactionDone(transaction);
  }

  async importFromFile(): Promise<ImportResult> {
    const document = await importModel();
    if (!document) {
      throw new Error("Import cancelled");
    }
    const imported = cloneDocument(document);
    const id = `${imported.model.id}-${Date.now()}`;
    imported.model.id = id;
    await this.save(id, imported);
    return { document: imported, ref: id };
  }

  async exportToFile(doc: ModelDocument): Promise<void> {
    exportModel(doc);
  }
}

export default IndexedDbAdapter;
