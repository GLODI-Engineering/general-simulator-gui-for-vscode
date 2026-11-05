// Compiled from packages/schemas/definitions/model/gsim_sch.schema.json by
// apps/frontend/scripts/gen-validators.mjs. Calling `ajv.compile()` here
// instead would build the validator with runtime code generation, which the
// VS Code webview's CSP forbids — the import alone blanked the whole webview.
import { validateGsimSchDocument as validateDocument } from "../generated/validators/gsim-sch.js";
import type { ModelDocument } from "../model/types";

export interface ModelValidationError {
  pointer: string;
  message: string;
}

export function validateModelDocument(document: unknown): ModelDocument {
  if (validateDocument(document)) {
    return document;
  }

  const [firstError] = validateDocument.errors ?? [];
  const pointer = firstError?.instancePath || "/";
  const message = firstError?.message ?? "Schema validation failed";
  throw new Error(`${pointer}: ${message}`);
}
