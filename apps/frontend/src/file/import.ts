import type { ModelDocument } from "../model/types";
import { deserialize } from "./deserializer";

export interface ImportModelOptions {
  onError?: (message: string) => void;
}

export async function importModel(
  input?: string | Uint8Array,
  options: ImportModelOptions = {},
): Promise<ModelDocument | null> {
  try {
    if (input !== undefined) {
      return deserialize(input);
    }

    const file = await pickImportFile();
    if (!file) {
      return null;
    }
    return deserialize(await file.text());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    options.onError?.(message);
    throw error;
  }
}

async function pickImportFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gsim_sch,application/json";
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}

export default importModel;
