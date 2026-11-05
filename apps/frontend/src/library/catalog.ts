import type { BlockMetadata } from "../model/types";
import { type CatalogEntrySource, loadCatalog } from "./catalog-core";
import catalogManifest from "./catalog-manifest.json";

export function loadCatalogFromManifest(): Record<string, BlockMetadata> {
  return loadCatalog(
    (catalogManifest as CatalogEntrySource[]).map((entry) => ({
      filePath: entry.filePath,
      metadata: entry.metadata,
    })),
  );
}

export default loadCatalog;
