import type { ModelDocument } from "../model/types";

export interface LoadError {
  error: string;
  pointer: string;
}

function toLoadError(message: string, pointer = "/"): LoadError {
  return { error: message, pointer };
}

const ALLOWED_TOP_KEYS = new Set(["schema_version", "model"]);

export function loadGsimSch(text: string): ModelDocument | LoadError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return toLoadError(error instanceof Error ? error.message : "Invalid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return toLoadError("Not a JSON object");
  }

  const doc = parsed as Record<string, unknown>;

  // 1. schema_version must be exactly 2
  if (doc.schema_version !== 2) {
    return toLoadError(
      `Unsupported gsim_sch schema_version: ${JSON.stringify(doc.schema_version)}`,
      "/schema_version",
    );
  }

  // 2. No extra top-level keys (additionalProperties: false at root)
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      return toLoadError(`Additional properties are not allowed ('${key}')`, "/");
    }
  }

  return parsed as ModelDocument;
}

export default loadGsimSch;
