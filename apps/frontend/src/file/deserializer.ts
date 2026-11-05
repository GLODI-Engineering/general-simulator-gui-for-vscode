import type { ModelDocument } from "../model/types";
import { validateModelDocument } from "./schema";

function decodeBytes(input: string | Uint8Array): string {
  return typeof input === "string" ? input : new TextDecoder().decode(input);
}

export function deserialize(input: string | Uint8Array): ModelDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBytes(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`/: ${message}`);
  }

  return validateModelDocument(parsed);
}

export const deserializeModel = deserialize;

export default deserialize;
