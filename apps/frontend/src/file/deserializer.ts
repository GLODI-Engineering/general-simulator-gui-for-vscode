import type { ModelDocument } from "../model/types";
import { canonicalizeBlockTypes } from "./canonical-types";
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

  // Aliases resolve to canonical names here, once, at the only door every
  // document comes through. See `canonical-types.ts`.
  return canonicalizeBlockTypes(validateModelDocument(parsed));
}

export const deserializeModel = deserialize;

export default deserialize;
