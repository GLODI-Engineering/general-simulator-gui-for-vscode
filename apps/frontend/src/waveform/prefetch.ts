import type { LODRequest } from "./lod-client";

export function scheduleAdjacentPrefetch(
  request: LODRequest,
  fetcher: (request: LODRequest) => Promise<unknown>,
): void {
  const run = () => {
    void fetcher(request);
  };

  const idleScheduler = globalThis.requestIdleCallback;
  if (typeof idleScheduler === "function") {
    idleScheduler(() => {
      run();
    });
    return;
  }

  window.setTimeout(run, 0);
}

export const prefetch = scheduleAdjacentPrefetch;
export const setupPrefetch = scheduleAdjacentPrefetch;

export default scheduleAdjacentPrefetch;
