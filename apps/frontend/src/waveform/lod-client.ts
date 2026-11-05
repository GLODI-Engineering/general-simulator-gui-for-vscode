export interface LODRequest {
  sim_id: string;
  signals: string[];
  t_start: number;
  t_end: number;
  max_points: number;
}

export interface LODResponse {
  t: Float64Array;
  [signal: string]: Float64Array;
}

export interface LODClientOptions {
  ipc: {
    getSlice(request: LODRequest): Promise<LODResponse>;
  };
  maxEntries?: number;
}

function keyFor(request: LODRequest): string {
  return JSON.stringify([
    request.sim_id,
    request.signals,
    request.t_start,
    request.t_end,
    request.max_points,
  ]);
}

export function getLODSlice({ ipc, maxEntries = 16 }: LODClientOptions) {
  const cache = new Map<string, Promise<LODResponse>>();

  const touch = (key: string, value: Promise<LODResponse>) => {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
  };

  return {
    async getSlice(request: LODRequest): Promise<LODResponse> {
      const key = keyFor(request);
      const existing = cache.get(key);
      if (existing) {
        return existing;
      }
      const pending = ipc.getSlice(request);
      touch(key, pending);
      return pending;
    },
  };
}

export default getLODSlice;
