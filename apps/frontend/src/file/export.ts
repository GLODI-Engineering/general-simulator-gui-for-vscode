import type { ModelDocument } from "../model/types";
import { serialize } from "./serializer";

function toFileName(name: string): string {
  const stem =
    name
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "model";
  return stem.endsWith(".gsim_sch") ? stem : `${stem}.gsim_sch`;
}

export function exportModel(modelDocument: ModelDocument): void {
  const blob = new Blob([serialize(modelDocument)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = toFileName(modelDocument.model.name);
  link.click();
  URL.revokeObjectURL(href);
}

export default exportModel;
